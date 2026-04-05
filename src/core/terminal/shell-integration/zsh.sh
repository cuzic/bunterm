#!/bin/zsh
# bunterm shell integration for Zsh
#
# This script emits OSC 633 control sequences to enable block UI features.
# Source this file in your .zshrc or run it in your zsh session.
#
# OSC 633 Sequences (VS Code terminal integration compatible):
#   A - Prompt start
#   B - Prompt end (command start)
#   C - Pre-execution (right before command runs)
#   D;exitcode - Command finished with exit code
#   E;commandline - Explicit command line
#   P;Key=Value - Property (e.g., Cwd)
#
# Usage:
#   source /path/to/zsh.sh
#   # or add to .zshrc:
#   # if [ -n "$BUNTERM_NATIVE" ]; then source /path/to/zsh.sh; fi

# Only enable if running in bunterm native terminal
# The terminal sets BUNTERM_NATIVE=1
if [[ -z "$BUNTERM_NATIVE" ]]; then
    return 2>/dev/null || exit 0
fi

# Prevent double-sourcing
if [[ -n "$__BUNTERM_SHELL_INTEGRATION__" ]]; then
    return 2>/dev/null || exit 0
fi
export __BUNTERM_SHELL_INTEGRATION__=1

# OSC escape sequence helpers
__bunterm_osc_633() {
    # Traditional stdout output (for xterm.js via tmux passthrough)
    printf '\033]633;%s\007' "$1"
    # Side-channel: send directly to bunterm daemon via osc633-sender binary
    if [[ -n "$BUNTERM_OSC633_SENDER" ]] && [[ -x "$BUNTERM_OSC633_SENDER" ]]; then
        local _type="${1%%\;*}"
        local _data="${1#*\;}"
        [[ "$_data" = "$1" ]] && _data=""
        "$BUNTERM_OSC633_SENDER" "$BUNTERM_SESSION" "$_type" "$_data" &>/dev/null &!
    fi
}

# Send current working directory
__bunterm_send_cwd() {
    __bunterm_osc_633 "P;Cwd=$PWD"
}

# Prompt start (A)
__bunterm_prompt_start() {
    __bunterm_osc_633 "A"
}

# Prompt end / command start (B)
__bunterm_prompt_end() {
    __bunterm_osc_633 "B"
}

# Pre-execution (C) - right before command runs
# Also sends the command line (E)
__bunterm_preexec() {
    local cmd="$1"
    # Escape special characters in the command
    cmd="${cmd//\\/\\\\}"
    cmd="${cmd//$'\n'/\\n}"
    cmd="${cmd//;/\\;}"
    __bunterm_osc_633 "E;$cmd"
    __bunterm_osc_633 "C"
}

# Command finished (D;exitcode) and prompt start (A)
__bunterm_precmd() {
    local exit_code=$?
    __bunterm_osc_633 "D;$exit_code"
    __bunterm_send_cwd
    __bunterm_prompt_start
}

# Add hooks to zsh
autoload -Uz add-zsh-hook

add-zsh-hook precmd __bunterm_precmd
add-zsh-hook preexec __bunterm_preexec

# Add prompt end marker to PROMPT
# Using %{ %} for zsh prompt escaping (doesn't count towards prompt length)
__bunterm_setup_prompt() {
    # Check if prompt end marker is already in PROMPT
    if [[ "$PROMPT" != *'%{]633;B%}'* ]]; then
        # Append the prompt end marker
        PROMPT="${PROMPT}%{$(printf '\033]633;B\007')%}"
    fi
}

# Handle RPROMPT similarly if present
__bunterm_setup_rprompt() {
    if [[ -n "$RPROMPT" && "$RPROMPT" != *'%{]633;'* ]]; then
        # RPROMPT doesn't need special handling for block UI
        :
    fi
}

# Send initial state
__bunterm_send_cwd
__bunterm_prompt_start

# Setup prompts
__bunterm_setup_prompt

# Re-setup prompt on precmd in case prompt managers change it
add-zsh-hook precmd __bunterm_setup_prompt
