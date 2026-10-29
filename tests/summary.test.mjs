import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { blockingStage, checkReport, formatDuration, nextVersion, readReports, render, renderCheck, shortDigest } from '../scripts/summary.mjs';

const reports = (name) => readReports(fileURLToPath(new URL(`fixtures/reports/${name}`, import.meta.url)));
const SHA = 'a0636b8f0e2d4c7a9b1c3d5e7f9a1b3c5d7e9f10';
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

test('an environment serving several hosts names each host it probed', () => {
    const several = reports('deployed');
    several.verifies = [{ ...several.verifies[0], probes: [
        { url: 'https://www.jterrazz.com/', path: '/', expect: [200], status: 200, ok: true },
        { url: 'https://jterrazz.com/', path: '/', expect: [301], status: 301, ok: true },
    ] }];
    const markdown = render(several, allSucceeded, context);

    assert.match(markdown, /ready 1\/1 · www\.jterrazz\.com\/ 200 · jterrazz\.com\/ 301 \|/);
});

test('a run blocked at Check names what failed inside the pass', () => {
    const blocked = reports('deployed');
    blocked.check = { gates: [{ name: 'Lint', outcome: 'failure', seconds: 5, note: 'types' }, { name: 'Test', outcome: 'not run' }] };
    const needs = { ...allSucceeded, check: { result: 'failure' }, deploy: { result: 'skipped' }, verify: { result: 'skipped' } };
    const markdown = render(blocked, needs, context);

    assert.match(markdown, /\*\*Lint \(types\)\*\* failed: nothing was deployed/);
    assert.match(markdown, /\| Lint \| ✗ failed · types \| 5s \|/);
});

test('a run blocked at Plan, with no report at all, still names the app and the stage', () => {
    const empty = { plan: undefined, check: undefined, builds: [], scans: [], deploys: [], verifies: [] };
    const needs = { plan: { result: 'failure' }, check: { result: 'success' }, build: { result: 'skipped' }, scan: { result: 'skipped' }, deploy: { result: 'skipped' }, verify: { result: 'skipped' } };
    const markdown = render(empty, needs, { ...context, sha: SHA, image: 'studio-alerts' });

    assert.equal(markdown.split('\n')[0], '## ❌ Deploy blocked at Plan');
    assert.equal(markdown.split('\n')[2], '`a0636b8` · ci: rebuild daily · push by jterrazz');
    assert.match(markdown, /`\.infrastructure\/application\.yaml`\) could not be planned, so nothing was built/);
});

test('a run blocked at Build says nothing was pushed', () => {
    const needs = { ...allSucceeded, build: { result: 'failure' }, scan: { result: 'skipped' }, deploy: { result: 'skipped' }, verify: { result: 'skipped' } };
    const markdown = render({ ...reports('deployed'), builds: [], scans: [], deploys: [], verifies: [] }, needs, context);

    assert.equal(markdown.split('\n')[0], '## ❌ Deploy blocked at Build');
    assert.match(markdown, /The image did not build: nothing was pushed, nothing was deployed\./);
    assert.match(markdown, /\| staging \| `sha-a0636b8` \| — \| — \| — not deployed \|/);
});

test('a rollout that failed says Helm rolled it back, and marks the environment', () => {
    const failed = reports('deployed');
    failed.deploys = [{ ...failed.deploys[0], outcome: 'failure' }];
    failed.verifies = [];
    const needs = { ...allSucceeded, deploy: { result: 'failure' }, verify: { result: 'skipped' } };
    const markdown = render(failed, needs, context);

    assert.equal(markdown.split('\n')[0], '## ❌ Deploy blocked at Deploy');
    assert.match(markdown, /staging did not roll out: Helm rolled it back/);
    assert.match(markdown, /\| staging \| `sha-a0636b8` \| `sha256:4e84…0b` \| — \| ❌ rollout failed, rolled back \|/);
    assert.doesNotMatch(markdown, /git tag/);
});

test('a release that does not answer names the probe, what it answered and what was expected', () => {
    const failed = reports('deployed');
    failed.verifies = [{ ...failed.verifies[0], outcome: 'failure', promoted: undefined, probes: [
        { url: 'https://staging.api.signews.internal.jterrazz.com/health', path: '/health', expect: [200], status: 503, ok: false },
    ] }];
    const needs = { ...allSucceeded, verify: { result: 'failure' } };
    const markdown = render(failed, needs, context);

    assert.equal(markdown.split('\n')[0], '## ❌ Deploy blocked at Verify');
    assert.match(markdown, /its alias was not moved/);
    assert.match(markdown, /- \*\*staging\*\*: ready 1\/1 · https:\/\/staging\.api\.signews\.internal\.jterrazz\.com\/health answered 503 \(expected 200\)/);
    assert.match(markdown, /\| staging \| `sha-a0636b8` \| [^|]+ \| [^|]+ \| ❌ ready 1\/1 · \/health 503 \(expected 200\) \|/);
});

test('a cancelled run says where it stopped, and a superseded verify says so', () => {
    const superseded = reports('deployed');
    superseded.verifies = [{ ...superseded.verifies[0], superseded: true, promoted: undefined }];
    const cancelled = render(reports('deployed'), { ...allSucceeded, deploy: { result: 'cancelled' }, verify: { result: 'skipped' } }, context);
    const markdown = render(superseded, allSucceeded, context);

    assert.equal(cancelled.split('\n')[0], '## ⚠️ Deploy cancelled at Deploy');
    assert.match(markdown, /\| staging \| `sha-a0636b8` \| [^|]+ \| [^|]+ \| ⚠️ superseded by a newer deploy \|/);
});
