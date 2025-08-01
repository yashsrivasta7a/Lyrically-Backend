const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { JSDOM } = require("jsdom");

require("dotenv").config();
const app = express();
const PORT = 4000;

app.use(cors());

const GENIUS_ACCESS_TOKEN = process.env.Genius_Token;
console.log(
  "Genius token present?",
  !!process.env.GENIUS_TOKEN || !!process.env.Genius_Token
);

function extractTextRecursively(node) {
  if (node.nodeName === "BR") {
    return "\n";
  } else if (node.nodeType === 3) {
    // Text node
    return node.textContent;
  } else if (node.nodeType === 1) {
    // Element node
    return Array.from(node.childNodes).map(extractTextRecursively).join("");
  }
  return "";
}

app.get("/lyrics", async (req, res) => {
  const { song } = req.query;
  if (!song) {
    return res.status(400).json({ error: "Song title is required" });
  }

  try {
    const response = await axios.get(
      `https://api.genius.com/search?q=${encodeURIComponent(song)}`,
      {
        headers: {
          Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`,
        },
      }
    );

    const hits = response.data.response.hits;
    if (hits.length > 0) {
      const songPath = hits[0].result.path;
      const lyricsPageUrl = `https://genius.com${songPath}`;
      const lyricsPageResponse = await axios.get(lyricsPageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        },
      });
      const dom = new JSDOM(lyricsPageResponse.data);
      const document = dom.window.document;

      const lyricsContainers = document.querySelectorAll(
        'div[data-lyrics-container="true"]'
      );

      if (lyricsContainers.length > 0) {
        let lyrics = "";
        lyricsContainers.forEach((container) => {
          const unwantedHeaders = container.querySelectorAll(
            ".StyledLink-sc-15c685a-0.kXMQlY.SongBioPreview__Wrapper-sc-f77d3c56-1.fIYpKy"
          );
          unwantedHeaders.forEach((el) => el.remove());
          lyrics += extractTextRecursively(container) + "\n\n";
        });

        lyrics = lyrics
          .replace(/\d+\s*Contributors.*?Lyrics/g, "") // Remove contributor text
          .replace(/\d+\s*Contributors.*?Lyrics/g, "") // Remove contributor text
          .replace(/\[.*?\]/g, "") // Remove bracketed text
          .replace(/\n\s*\n\s*\n/g, "\n\n") // Clean up extra newlines
          .trim();

        return res.json({ lyrics });
      } else {
        return res
          .status(404)
          .json({ error: "Lyrics not found on Genius page" });
      }
    } else {
      return res.status(404).json({ error: "Lyrics not found" });
    }
  } catch (error) {
    console.error("Error fetching lyrics:", error.message);
    return res.status(500).json({ error: "Failed to fetch lyrics" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
