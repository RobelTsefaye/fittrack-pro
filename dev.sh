#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
exec node node_modules/.bin/next dev --webpack --hostname 0.0.0.0
