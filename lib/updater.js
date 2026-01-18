
const { spawn } = require('child_process');

function runUpdate({ repo, branch }, logCallback) {
  const run = (cmd, args) => {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args);
      
      proc.stdout.on('data', (data) => {
        logCallback({ message: data.toString(), type: 'info' });
      });

      proc.stderr.on('data', (data) => {
        logCallback({ message: data.toString(), type: 'error' });
      });

      proc.on('close', (code) => {
        resolve(code);
      });
    });
  };

  (async () => {
    logCallback({ message: `Starting update from ${repo} [${branch}]`, type: 'info' });
    
    await run('git', ['fetch', 'origin']);
    await run('git', ['reset', '--hard', `origin/${branch}`]);
    await run('npm', ['install', '--production']);
    
    logCallback({ message: 'Update process finished.', type: 'success' });
  })();
}

module.exports = { runUpdate };
