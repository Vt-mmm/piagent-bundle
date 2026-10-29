#!/usr/bin/env node
import { doctor } from '../src/doctor.mjs';

const result = doctor(process.argv[2] ?? process.cwd());
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
