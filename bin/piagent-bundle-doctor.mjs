#!/usr/bin/env node
import { doctor } from '../src/doctor.mjs';

const args = process.argv.slice(2), at = args.indexOf('--expect');
const expect = at >= 0 ? args.splice(at, 2)[1] : undefined;
const result = doctor(args[0] ?? process.cwd(), { expect });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
