#!/bin/bash
# bunterm shell integration for Bash
#
# This script emits OSC 633 control sequences to enable block UI features.
# Source this file in your .bashrc or run it in your bash session.
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
#   source /path/to/bash.sh
#   # or add to .bashrc:
#   # if [ -n "$BUNTERM_NATIVE" ]; then source /path/to/bash.sh; fi

# Only enable if running in bunterm native terminal
# The terminal sets BUNTERM_NATIVE=1
if [ -z "$BUNTERM_NATIVE" ]; then
    return 2>/dev/null || exit 0
fi

# Prevent double-sourcing
if [ -n "$__BUNTERM_SHELL_INTEGRATION__" ]; then
    return 2>/dev/null || exit 0
fi
export __BUNTERM_SHELL_INTEGRATION__=1

# OSC escape sequence helpers
__bunterm_osc_633() {
    # Traditional stdout output (for xterm.js via tmux passthrough)
    printf '\033]633;%s\007' "$1"
    # Side-channel: send directly to bunterm daemon via osc633-sender binary
    if [ -n "$BUNTERM_OSC633_SENDER" ] && [ -x "$BUNTERM_OSC633_SENDER" ]; then
        local _type="${1%%\;*}"
        local _data="${1#*\;}"
        [ "$_data" = "$1" ] && _data=""
        "$BUNTERM_OSC633_SENDER" "$BUNTERM_SESSION" "$_type" "$_data" &>/dev/null &
        disown 2>/dev/null
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
__bunterm_preexec() {
    __bunterm_osc_633 "C"
}

# Command finished (D;exitcode)
__bunterm_precmd() {
    local exit_code=$?
    __bunterm_osc_633 "D;$exit_code"
    __bunterm_send_cwd
    __bunterm_prompt_start
}

# Send command line (E;commandline)
__bunterm_send_command() {
    local cmd="$1"
    # Escape special characters in the command
    cmd="${cmd//\\/\\\\}"
    cmd="${cmd//$'\n'/\\n}"
    cmd="${cmd//;/\\;}"
    __bunterm_osc_633 "E;$cmd"
}

# Store the original PROMPT_COMMAND
__bunterm_original_prompt_command="$PROMPT_COMMAND"

# Set up precmd (runs before each prompt)
PROMPT_COMMAND='__bunterm_precmd; '"$__bunterm_original_prompt_command"

# DEBUG trap for preexec (runs before each command)
# This captures the command being executed
__bunterm_debug_trap() {
    # Skip if not the first command in the pipeline
    if [ -n "$COMP_LINE" ]; then
        return
    fi

    # Skip if this is a prompt command
    if [[ "$BASH_COMMAND" == "__bunterm_precmd"* ]]; then
        return
    fi

    # Get the current command
    local current_command="$BASH_COMMAND"

    # Send the command line
    __bunterm_send_command "$current_command"

    # Signal pre-execution
    __bunterm_preexec
}

# Set up the DEBUG trap
trap '__bunterm_debug_trap' DEBUG

# Modify PS1 to include prompt end marker
# This runs after PS1 is displayed but before user input
__bunterm_setup_ps1() {
    # Append prompt end marker to PS1 if not already there
    if [[ "$PS1" != *'\[\033]633;B\007\]'* ]]; then
        PS1="${PS1}\[\033]633;B\007\]"
    fi
}

# Send initial state
__bunterm_send_cwd
__bunterm_prompt_start
__bunterm_setup_ps1

# Re-setup PS1 if it changes (e.g., by starship or other prompt tools)
PROMPT_COMMAND="$PROMPT_COMMAND"'; __bunterm_setup_ps1'
