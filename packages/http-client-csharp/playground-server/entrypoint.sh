#!/bin/bash
# Start SSH daemon for App Service remote access
/usr/sbin/sshd

# Start the playground server
exec dotnet /app/playground-server.dll
