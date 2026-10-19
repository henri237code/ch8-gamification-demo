// Read-only startup checks. Native smoke tests use memory, never data/ch8.sqlite.
const net = require('node:net');
async function main() {
  const mode = process.argv[2];
  if (mode === 'environment') {
    const major = Number(process.versions.node.split('.')[0]);
    if (![22, 24].includes(major)) throw new Error('Installer Node.js 24 LTS depuis https://nodejs.org/en/download puis relancer INSTALLER-WINDOWS.cmd.');
    console.log(`Node.js ${process.version} - ${process.arch}`);
    console.log(`Executable : ${process.execPath}`);
  } else if (mode === 'native') {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    try { db.prepare('SELECT 1').get(); } finally { db.close(); }
    await require('sharp')({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
    console.log('SQLite et traitement des photos : OK.');
  } else if (mode === 'port') {
    await new Promise((resolve,reject)=>{
      const server=net.createServer();
      server.once('error',error=>reject(new Error(error.code==='EADDRINUSE'
        ? 'Le port 3080 est deja utilise. Si CH8 est deja ouvert, utiliser sa fenetre existante. Sinon fermer le programme qui utilise ce port avant de relancer.'
        : `Impossible de reserver le port 3080 : ${error.message}`)));
      server.listen(3080,'0.0.0.0',()=>server.close(resolve));
    });
  } else throw new Error('Verification inconnue.');
}
main().catch(error=>{
  console.error(`\nVerification impossible : ${error.message}`);
  if(process.argv[2]==='native')console.error('Ne pas effacer data. Relancer INSTALLER-WINDOWS.cmd avec Internet pour reinstaller les composants pour cette version de Node.js.');
  process.exitCode=1;
});
