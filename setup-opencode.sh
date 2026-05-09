#!/bin/bash
# Fyso Plugin — OpenCode Setup
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/fyso-dev/fyso-plugin/main/setup-opencode.sh)

set -e

echo ""
echo "@fyso/opencode-plugin setup"
echo ""
echo "Project: $(pwd)"
echo ""

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "Downloading fyso-plugin..."
git clone --depth 1 --quiet https://github.com/fyso-dev/fyso-plugin.git "$TMPDIR/fyso-plugin"

# Agents
echo "Copying agents..."
mkdir -p .opencode/agents
cp -r "$TMPDIR/fyso-plugin/.opencode/agents/"*.md .opencode/agents/ 2>/dev/null
echo "  $(ls .opencode/agents/*.md 2>/dev/null | wc -l | tr -d ' ') agents"

# Skills
echo "Copying skills..."
mkdir -p .opencode/skills
for skill in "$TMPDIR/fyso-plugin/skills/"*/; do
  name=$(basename "$skill")
  if [ -f "$skill/SKILL.md" ]; then
    mkdir -p ".opencode/skills/$name"
    cp -r "$skill"* ".opencode/skills/$name/"
  fi
done
echo "  $(ls -d .opencode/skills/*/ 2>/dev/null | wc -l | tr -d ' ') skills"

# Reference
echo "Copying reference docs..."
cp "$TMPDIR/fyso-plugin/FYSO-REFERENCE.md" ./FYSO-REFERENCE.md
echo "  FYSO-REFERENCE.md"

# opencode.json
echo "Updating opencode.json..."
if [ -f opencode.json ]; then
  # Add plugin and MCP if not present
  python3 -c "
import json, sys
with open('opencode.json') as f:
    cfg = json.load(f)
plugins = cfg.get('plugin', [])
if '@fyso/opencode-plugin' not in plugins:
    plugins.append('@fyso/opencode-plugin')
    cfg['plugin'] = plugins
mcp = cfg.get('mcp', {})
if 'fyso' not in mcp:
    mcp['fyso'] = {'type': 'remote', 'url': 'https://mcp.fyso.dev/mcp'}
    cfg['mcp'] = mcp
with open('opencode.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
" 2>/dev/null || echo "  (could not update, edit manually)"
else
  cat > opencode.json << 'EOF'
{
  "plugin": ["@fyso/opencode-plugin"],
  "mcp": {
    "fyso": {
      "type": "remote",
      "url": "https://mcp.fyso.dev/mcp"
    }
  }
}
EOF
fi
echo "  opencode.json"

echo ""
echo "Done! Restart OpenCode to activate."
echo ""
echo "Available:"
echo "  Skills:  via skill tool (plan, build, verify, ui, ...)"
echo "  Agents:  @architect, @builder, @designer, @verifier, @ui-architect"
echo "  Tools:   fyso-sync-team (sync your Fyso team agents)"
echo "  MCP:     Fyso server (80+ operations via OAuth)"
echo ""
