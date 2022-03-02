#!/bin/sh

# If we're in CI, exit early
if [ -n $CI ]; then exit 0; fi
# otherwise, run the supplied command
$@
