# === Variables to adjust ===
$NodeExePath = "C:\Program Files\nodejs\node.exe"
$Pm2ResurrectCmd = "C:\Users\$env:USERNAME\AppData\Roaming\npm\node_modules\pm2\bin\pm2 resurrect"
$TaskName = "PM2_Resurrect"
$ServerJsPath = "C:\Code\Lyrically\Backend\server.js"

# === Step 1: Start your Node.js server with PM2 ===
Write-Host "Starting your Node.js server with PM2..."
pm2 start $ServerJsPath

# === Step 2: Save current PM2 process list ===
Write-Host "Saving PM2 process list..."
pm2 save

# === Step 3: Create a Scheduled Task to resurrect PM2 on login ===
Write-Host "Creating Scheduled Task for PM2 resurrect..."
$Action = New-ScheduledTaskAction -Execute $NodeExePath -Argument $Pm2ResurrectCmd
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest

Register-ScheduledTask -Action $Action -Trigger $Trigger -Principal $Principal -TaskName $TaskName -Description "Resurrect PM2 processes at user login" -Force

Write-Host "✅ All done! Your Node.js server will now restart automatically after reboot."
pause
