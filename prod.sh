#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
exec node node_modules/.bin/next start --hostname 0.0.0.0 --port 3001
