import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const localPython = isWindows
  ? join('.venv', 'Scripts', 'python.exe')
  : join('.venv', 'bin', 'python');
const pytestArgs = ['-m', 'pytest', 'tests/direct/test_lastlight.py', '-q'];

const candidates = process.env.PYTHON
  ? [[process.env.PYTHON, []]]
  : [
      ...(existsSync(localPython) ? [[localPython, []]] : []),
      ...(isWindows ? [['python', []], ['py', ['-3']]] : [['python3', []], ['python', []]]),
    ];

for (const [command, prefixArgs] of candidates) {
  const result = spawnSync(command, [...prefixArgs, ...pytestArgs], { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) {
    console.error(`Could not run contract tests with ${command}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error('Python was not found. Create .venv and install requirements-dev.txt before running npm test.');
process.exit(1);
