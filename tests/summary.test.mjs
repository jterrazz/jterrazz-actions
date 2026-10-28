import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { blockingStage, checkReport, formatDuration, nextVersion, readReports, render, renderCheck, shortDigest } from '../scripts/summary.mjs';

const reports = (name) => readReports(fileURLToPath(new URL(`fixtures/reports/${name}`, import.meta.url)));
const context = { message: 'ci: rebuild daily\n\nbody', actor: 'jterrazz', event: 'push', now: '2026-10-28T22:19:15.000Z' };
const allSucceeded = { plan: { result: 'success' }, check: { result: 'success' }, build: { result: 'success' }, scan: { result: 'success' }, deploy: { result: 'success' }, verify: { result: 'success' } };

test('a deployed run names the app and its environments, then the commit line', () => {
    const markdown = render(reports('deployed'), allSucceeded, context);
    const lines = markdown.split('\n');

    assert.equal(lines[0], '## ✅ signews-api deployed to staging');
    assert.equal(lines[2], '`a0636b8` · ci: rebuild daily · 3m 05s · push by jterrazz');
});

test('a deployed run tabulates each environment, the untouched release one included', () => {
    const markdown = render(reports('deployed'), allSucceeded, context);

    assert.match(
        markdown,
        /\| staging \| `sha-a0636b8` → latest \| `sha256:4e84…0b` \| \[staging\.api\.signews\.internal\.jterrazz\.com\]\(https:\/\/staging\.api\.signews\.internal\.jterrazz\.com\/health\) \| ready 1\/1 · \/health 200 \|/,
    );
    assert.match(markdown, /\| prod \| `v1\.7\.2` \| — \| — \| unchanged \|/);
});

test('a deployed run lists the checks, a cached pass named as such', () => {
    const markdown = render(reports('deployed'), allSucceeded, context);

    assert.match(markdown, /\| Lint \| ✓ cached \| cached \|/);
    assert.match(markdown, /\| Build \| ✓ passed \| 17s \|/);
    assert.match(markdown, /\| Dockerfile \| ✓ passed · 2 warnings \| 1s \|/);
    assert.match(markdown, /\| Mutation \| — off on this run \| — \|/);
});

test('a deployed run states the image: size against the previous one, base, findings, exceptions', () => {
    const markdown = render(reports('deployed'), allSucceeded, context);

    assert.match(markdown, /\| `sha-a0636b8` \| 96 MB \(−182 MB\) \| `node:24-alpine` \| 0 critical · 0 high \| none \|/);
    assert.match(markdown, /<details><summary>Trivy report · sha-a0636b8 \(0 entries\)<\/summary>/);
});

test('a deployed run that left a release environment says how to ship it', () => {
    const markdown = render(reports('deployed'), allSucceeded, context);

    assert.match(markdown, /> prod stays on `v1\.7\.2`\. To ship this commit: `git tag v1\.7\.3 && git push --tags`$/m);
});

test('a run blocked at Scan names the stage and the fixable critical, and offers no release hint', () => {
    const needs = { ...allSucceeded, scan: { result: 'failure' }, deploy: { result: 'skipped' }, verify: { result: 'skipped' } };
    const markdown = render(reports('blocked-at-scan'), needs, context);

    assert.equal(markdown.split('\n')[0], '## ❌ Deploy blocked at Scan');
    assert.match(markdown, /\| CVE-2026-1234 \| undici \| 6\.21\.0 \| 6\.21\.2 \|/);
    assert.doesNotMatch(markdown, /\| CVE \|[^\n]*\n[^\n]*\n\| CVE-2026-2222/);
    assert.match(markdown, /\| staging \| `sha-a0636b8` \| `sha256:4e84…0b` \| — \| — not deployed \|/);
    assert.match(markdown, /1 critical · 2 high · 1 fixable critical \| 1 \|/);
    assert.match(markdown, /\| CVE-2026-3333 \| HIGH \| libssl3 \| 3\.3\.0 \| no fix yet \|/);
    assert.doesNotMatch(markdown, /git tag/);
});

test('a run blocked at Check names the failed pass', () => {
    const blocked = reports('deployed');
    blocked.check = { gates: [{ name: 'Build', outcome: 'success', seconds: 3 }, { name: 'Lint', outcome: 'failure', seconds: 2 }, { name: 'Test', outcome: 'not run' }] };
    const needs = { plan: { result: 'success' }, check: { result: 'failure' }, build: { result: 'success' }, scan: { result: 'success' }, deploy: { result: 'skipped' }, verify: { result: 'skipped' } };
    const markdown = render(blocked, needs, context);

    assert.equal(markdown.split('\n')[0], '## ❌ Deploy blocked at Check');
    assert.match(markdown, /\*\*Lint\*\* failed: nothing was deployed/);
    assert.match(markdown, /\| Test \| — not run \| — \|/);
});

test('a run whose event deploys nowhere says so', () => {
    const quiet = reports('deployed');
    quiet.plan = { ...quiet.plan, ref: 'refs/tags/v2.0.0', refName: 'v2.0.0', builds: [], deployments: [], untouched: [{ env: 'staging', deploy: 'push' }] };
    const markdown = render({ ...quiet, builds: [], scans: [], deploys: [], verifies: [] }, { plan: { result: 'success' }, check: { result: 'skipped' } }, context);

    assert.equal(markdown.split('\n')[0], '## ⚪ signews-api: nothing to deploy');
    assert.match(markdown, /No environment of `\.infrastructure\/application\.yaml` deploys on a push of `v2\.0\.0`\./);
});

test('the formatters', () => {
    assert.equal(formatDuration(185), '3m 05s');
    assert.equal(formatDuration(8), '8s');
    assert.equal(shortDigest('sha256:647e0000000004'), 'sha256:647e…04');
    assert.equal(nextVersion('v1.7.2'), 'v1.7.3');
    assert.equal(nextVersion(undefined), 'v0.1.0');
    assert.deepEqual(blockingStage({ plan: { result: 'success' }, build: { result: 'cancelled' } }), { id: 'build', label: 'Build', result: 'cancelled' });
});

test('the check report keeps the gates in order and marks those never reached', () => {
    const lines = ['{"name":"Install","outcome":"success","seconds":3,"cached":false}', '{"name":"Build","outcome":"failure","seconds":5,"cached":false}', ''];
    const check = checkReport(lines, ['Install', 'Build', 'Lint', 'Test', 'Mutation']);

    assert.deepEqual(check.gates.map((gate) => [gate.name, gate.outcome]), [
        ['Install', 'success'],
        ['Build', 'failure'],
        ['Lint', 'not run'],
        ['Test', 'not run'],
        ['Mutation', 'not run'],
    ]);
    assert.match(renderCheck(check), /^## ❌ Check failed at Build\n\n\| Pass \| Result \| Duration \|/);
});
