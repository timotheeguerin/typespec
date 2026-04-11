#!/bin/bash
# Start SSH daemon for App Service remote access
/usr/sbin/sshd

# Create temp directory on /home (persistent, no mmap restrictions)
mkdir -p /home/tmp

# Start the playground server
exec dotnet /app/playground-server.dll
