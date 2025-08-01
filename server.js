const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { JSDOM } = require("jsdom");

require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

const GENIUS_ACCESS_TOKEN = process.env.GENIUS_TOKEN || process.env.Genius_Token;
console.log("Genius token present?", !!GENIUS_ACCESS_TOKEN);

function extractTextRecursively(node) {
  if (node.nodeName === "BR") {
    return "\n";
  } else if (node.nodeType === 3) {
    return node.textContent;
  } else if (node.nodeType === 1) {
    return Array.from(node.childNodes).map(extractTextRecursively).join("");
  }
  return "";
}

// Enhanced axios instance with better headers and retry logic
const createAxiosInstance = () => {
  return axios.create({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    }
  });
};

// Retry function with exponential backoff
const retryRequest = async (requestFn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

app.get("/lyrics", async (req, res) => {
  const { song } = req.query;
  if (!song) {
    return res.status(400).json({ error: "Song title is required" });
  }

  try {
    // First, search for the song using Genius API
    const searchResponse = await retryRequest(async () => {
      return await axios.get(
        `https://api.genius.com/search?q=${encodeURIComponent(song)}`,
        {
          headers: {
            Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`,
            "User-Agent": "LyricsApp/1.0"
          },
          timeout: 10000,
        }
      );
    });

    const hits = searchResponse.data.response.hits;
    if (hits.length === 0) {
      return res.status(404).json({ error: "Song not found" });
    }

    const songPath = hits[0].result.path;
    const lyricsPageUrl = `https://genius.com${songPath}`;
    
    console.log(`Fetching lyrics from: ${lyricsPageUrl}`);

    // Create a new axios instance for scraping with better headers
    const axiosInstance = createAxiosInstance();
    
    // Add random delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

    const lyricsPageResponse = await retryRequest(async () => {
      return await axiosInstance.get(lyricsPageUrl, {
        headers: {
          ...axiosInstance.defaults.headers,
          'Referer': 'https://www.google.com/',
          'Origin': 'https://genius.com'
        }
      });
    });

    const dom = new JSDOM(lyricsPageResponse.data);
    const document = dom.window.document;

    const lyricsContainers = document.querySelectorAll(
      'div[data-lyrics-container="true"]'
    );

    if (lyricsContainers.length > 0) {
      let lyrics = "";
      lyricsContainers.forEach((container) => {
        // Remove unwanted elements
        const unwantedSelectors = [
          ".StyledLink-sc-15c685a-0.kXMQlY.SongBioPreview__Wrapper-sc-f77d3c56-1.fIYpKy",
          "[data-exclude-from-selection='true']",
          ".ReferentFragmentdesktop__ClickTarget-sc-110r0d9-0"
        ];
        
        unwantedSelectors.forEach(selector => {
          const unwantedElements = container.querySelectorAll(selector);
          unwantedElements.forEach(el => el.remove());
        });
        
        lyrics += extractTextRecursively(container) + "\n\n";
      });

      lyrics = lyrics
        .replace(/\d+\s*Contributors.*?Lyrics/gi, "")
        .replace(/\[.*?\]/g, "")
        .replace(/You might also like/gi, "")
        .replace(/Embed/gi, "")
        .replace(/\n\s*\n\s*\n/g, "\n\n")
        .replace(/^\s*\n/gm, "")
        .trim();

      if (lyrics.length < 50) {
        return res.status(404).json({ error: "Lyrics content too short or not found" });
      }

      return res.json({ 
        lyrics,
        source: "genius.com",
        song_title: hits[0].result.title,
        artist: hits[0].result.primary_artist.name
      });
    } else {
      return res.status(404).json({ error: "Lyrics not found on Genius page" });
    }
  } catch (error) {
    console.error("Error fetching lyrics:", error.message);
    
    // Provide more specific error messages
    if (error.response?.status === 403) {
      return res.status(503).json({ 
        error: "Access temporarily blocked. Please try again later.",
        details: "The lyrics service is temporarily unavailable due to rate limiting."
      });
    } else if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: "Too many requests. Please try again later.",
        details: "Rate limit exceeded."
      });
    } else if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: "Request timeout",
        details: "The request took too long to complete."
      });
    }
    
    return res.status(500).json({ 
      error: "Failed to fetch lyrics",
      details: error.message
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.json({ 
    message: "Lyrics API is running",
    endpoints: {
      lyrics: "/lyrics?song=<song_title>",
      health: "/health"
    }
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});