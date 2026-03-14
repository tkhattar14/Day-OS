#!/bin/bash
# DayOS CLI — send commands to the dashboard
#
# SPEAK (ElevenLabs TTS):
#   focus-say.sh speak "Hello world"
#
# ANNOUNCE (text stays on screen):
#   focus-say.sh announce "Meeting at 3 PM"
#   focus-say.sh announce "Server down!" urgent
#
# GOALS (set today's goals):
#   focus-say.sh goals "Ship feature X" "Fix bug Y" "Review PRs"
#
# HERO (take over center UI with custom HTML):
#   focus-say.sh hero '<div style="font-size:2rem">🎯 Ship it!</div>'
#   focus-say.sh hero '<h1>Deploy in progress...</h1>' 60     # auto-clear after 60s
#   focus-say.sh hero-clear                                    # revert to schedule
#
# RAW COMMAND:
#   focus-say.sh raw '{"action":"celebrate"}'
#   focus-say.sh raw '{"action":"alert","type":"info","title":"Heads Up","message":"Deploy complete"}'
#   focus-say.sh raw '{"action":"timer","minutes":25,"label":"Pomodoro"}'
#   focus-say.sh raw '{"action":"sound","name":"chime"}'
#
# STATUS:
#   focus-say.sh status

DASHBOARD_URL="${DASHBOARD_URL:-https://localhost:3142}"
CURL_OPTS="-sk"

case "${1:-help}" in
  speak)
    curl $CURL_OPTS -X POST "$DASHBOARD_URL/api/tts" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$2\"}"
    ;;
  announce)
    TYPE="${3:-info}"
    curl $CURL_OPTS -X POST "$DASHBOARD_URL/api/announce" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$2\", \"type\": \"$TYPE\"}"
    ;;
  goals)
    shift
    ITEMS=""
    for g in "$@"; do
      [ -n "$ITEMS" ] && ITEMS="$ITEMS,"
      ITEMS="$ITEMS{\"text\":\"$g\",\"done\":false}"
    done
    DATE=$(date +%Y-%m-%d)
    curl $CURL_OPTS -X POST "$DASHBOARD_URL/api/commitments" \
      -H "Content-Type: application/json" \
      -d "{\"date\":\"$DATE\",\"commitments\":[$ITEMS]}"
    ;;
  hero)
    TTL="${3:-0}"
    # Use python to safely JSON-encode the HTML
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'html': sys.argv[1], 'ttl': int(sys.argv[2]), 'source': 'cli'}))" "$2" "$TTL")
    curl $CURL_OPTS -X POST "$DASHBOARD_URL/api/hero" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD"
    ;;
  hero-clear)
    curl $CURL_OPTS -X POST "$DASHBOARD_URL/api/hero/clear"
    ;;
  raw)
    curl $CURL_OPTS -X POST "$DASHBOARD_URL/api/command" \
      -H "Content-Type: application/json" \
      -d "$2"
    ;;
  status)
    curl $CURL_OPTS "$DASHBOARD_URL/api/status" | python3 -m json.tool 2>/dev/null || \
    curl $CURL_OPTS "$DASHBOARD_URL/api/status"
    ;;
  *)
    echo "DayOS CLI"
    echo ""
    echo "Usage:"
    echo "  focus-say.sh speak \"Hello\"         Send voice message (TTS)"
    echo "  focus-say.sh announce \"text\"        Persistent text on screen"
    echo "  focus-say.sh goals \"A\" \"B\" \"C\"     Set today's goals"
    echo "  focus-say.sh hero \"<html>\"            Take over center UI"
    echo "  focus-say.sh hero \"<html>\" 60        ...auto-clear after 60s"
    echo "  focus-say.sh hero-clear               Revert center to schedule"
    echo "  focus-say.sh raw '{json}'              Raw WebSocket command"
    echo "  focus-say.sh status                    Server status"
    echo ""
    echo "Environment:"
    echo "  DASHBOARD_URL  Server URL (default: https://localhost:3142)"
    ;;
esac
