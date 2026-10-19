#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Node.js et npm sont nécessaires sur le Mac serveur.'
  exit 1
fi
if [[ ! -x node_modules/.bin/tsx ]]; then
  print 'Les dépendances du projet doivent être installées sur ce Mac (npm ci).'
  exit 1
fi
print 'CH8 : préparation des écrans, puis démarrage pour les appareils du même réseau.'
npm run build
export HOST=0.0.0.0
export PORT=3080
exec npm start
