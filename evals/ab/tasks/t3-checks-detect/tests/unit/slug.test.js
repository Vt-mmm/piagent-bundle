import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug } from '../../src/slug.js';

test('lowercases and joins words', () => assert.equal(slugify('Hello World'), 'hello-world'));
test('adds a suffix on collision', () => assert.equal(uniqueSlug('Hi', new Set(['hi'])), 'hi-2'));
