#!/usr/bin/env bash
# invariant: one gate of the check, run and recorded: its name, its outcome, its duration, and
# whether the toolchain proved it from its cache instead of running it ("nothing ran"). The
# record is one JSON line in $STUDIO_CHECK_DIR/gates.jsonl, which the report step turns into the
# checks table. `gate.sh --off <name> <why>` records a gate this run does not run.
set -uo pipefail

record() {
  jq -nc --arg name "$1" --arg outcome "$2" --argjson seconds "$3" --argjson cached "$4" --arg note "$5" \
    '{name: $name, outcome: $outcome, seconds: $seconds, cached: $cached} + (if $note == "" then {} else {note: $note} end)' \
    >> "$STUDIO_CHECK_DIR/gates.jsonl"
}

if [ "$1" = "--off" ]; then
  record "$2" off 0 false "$3"
  echo "$2: $3"
  exit 0
fi

name="$1"
shift
log="$STUDIO_CHECK_DIR/$name.log"
GATE_NOTE_FILE="$STUDIO_CHECK_DIR/$name.note"
export GATE_NOTE_FILE
: > "$GATE_NOTE_FILE"
start=$(date +%s)
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
seconds=$(( $(date +%s) - start ))
cached=false
# outside: @jterrazz/typescript says "nothing ran" when it proves a gate from the tree's cached verdict.
if [ "$status" -eq 0 ] && grep -q 'nothing ran' "$log"; then cached=true; fi
outcome=success
note=$(cat "$GATE_NOTE_FILE")
if [ "$status" -ne 0 ]; then
  outcome=failure
  # value: a failed gate names what failed, so the checks table answers without the log: the
  # passes @jterrazz/typescript's verdict line lists ("✗ 15 passes, 1 failed: types"), or
  # Vitest's count of failed tests. Nothing recognised leaves the note empty.
  if [ -z "$note" ]; then
    plain=$(sed 's/\x1b\[[0-9;]*m//g' "$log")
    passes=$(grep -oE '[0-9]+ failed: .+$' <<< "$plain" | tail -n 1 | sed -E 's/^[0-9]+ failed: //')
    tests=$(grep -oE '^ +Tests +[0-9]+ failed' <<< "$plain" | tail -n 1 | grep -oE '[0-9]+' || true)
    if [ -n "$passes" ]; then
      note="$passes"
    elif [ -n "$tests" ]; then
      note="$tests failed test"
      if [ "$tests" -ne 1 ]; then note="${note}s"; fi
    fi
  fi
fi
record "$name" "$outcome" "$seconds" "$cached" "$note"
exit "$status"
