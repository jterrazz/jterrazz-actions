import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { plan } from '../scripts/plan.mjs';

const manifest = (name) => JSON.parse(readFileSync(new URL(`fixtures/manifests/${name}.json`, import.meta.url), 'utf8'));
const SHA = 'a0636b8f0e2d4c7a9b1c3d5e7f9a1b3c5d7e9f10';
const TAG_SHA = '647e1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b';

test('a push to main deploys the push environments with latest, and leaves the release ones', () => {
    const result = plan({ manifest: manifest('staging-and-prod'), event: 'push', ref: 'refs/heads/main', refName: 'main', sha: SHA });

    assert.deepEqual(result.builds, [{ sha: SHA, short: 'a0636b8', tag: 'sha-a0636b8', ref: SHA, alias: 'latest' }]);
    assert.deepEqual(result.deployments, [
        { env: 'staging', sha: SHA, short: 'a0636b8', tag: 'sha-a0636b8', alias: 'latest', ref: SHA },
    ]);
    assert.deepEqual(result.untouched, [{ env: 'prod', deploy: 'release' }]);
});

test('a v* tag deploys the release environments, aliased as that tag', () => {
    const result = plan({ manifest: manifest('staging-and-prod'), event: 'push', ref: 'refs/tags/v1.7.3', refName: 'v1.7.3', sha: TAG_SHA });

    assert.deepEqual(result.deployments.map((d) => [d.env, d.tag, d.alias, d.ref]), [['prod', 'sha-647e1c2', 'v1.7.3', 'refs/tags/v1.7.3']]);
    assert.deepEqual(result.untouched, [{ env: 'staging', deploy: 'push' }]);
});

test('the weekly schedule rebuilds main and the newest tag, one build per commit', () => {
    const result = plan({
        manifest: manifest('staging-and-prod'),
        event: 'schedule',
        ref: 'refs/heads/main',
        refName: 'main',
        sha: SHA,
        newestTag: { name: 'v1.7.2', sha: TAG_SHA },
    });

    assert.deepEqual(result.builds.map((b) => [b.tag, b.ref]), [
        ['sha-a0636b8', SHA],
        ['sha-647e1c2', 'refs/tags/v1.7.2'],
    ]);
    assert.deepEqual(result.deployments.map((d) => [d.env, d.alias]), [
        ['staging', 'latest'],
        ['prod', 'v1.7.2'],
    ]);
});

test('a schedule whose main HEAD is the newest tag builds that commit once', () => {
    const result = plan({
        manifest: manifest('staging-and-prod'),
        event: 'schedule',
        ref: 'refs/heads/main',
        refName: 'main',
        sha: SHA,
        newestTag: { name: 'v1.7.3', sha: SHA },
    });

    assert.equal(result.builds.length, 1);
    assert.equal(result.deployments.length, 2);
});

test('a schedule with no tag yet, or no release environment, plans no tag build', () => {
    const noTag = plan({ manifest: manifest('staging-and-prod'), event: 'schedule', ref: 'refs/heads/main', refName: 'main', sha: SHA });
    const pushOnly = plan({
        manifest: manifest('push-only'),
        event: 'schedule',
        ref: 'refs/heads/main',
        refName: 'main',
        sha: SHA,
        newestTag: { name: 'v2.0.0', sha: TAG_SHA },
    });

    assert.deepEqual(noTag.deployments.map((d) => d.env), ['staging']);
    assert.deepEqual(pushOnly.builds.map((b) => b.tag), ['sha-a0636b8']);
});

test('a tag on an app with no release environment deploys nothing', () => {
    const result = plan({ manifest: manifest('push-only'), event: 'push', ref: 'refs/tags/v2.0.0', refName: 'v2.0.0', sha: SHA });

    assert.deepEqual(result.builds, []);
    assert.deepEqual(result.deployments, []);
});

test('a shared app deploys as the one environment `shared`', () => {
    const result = plan({ manifest: manifest('shared'), event: 'workflow_dispatch', ref: 'refs/heads/main', refName: 'main', sha: SHA });

    assert.deepEqual(result.deployments.map((d) => [d.env, d.alias]), [['shared', 'latest']]);
});

test('an environment naming neither deploy value fails the plan, naming each one', () => {
    assert.throws(
        () => plan({ manifest: manifest('invalid-deploy'), event: 'push', ref: 'refs/heads/main', refName: 'main', sha: SHA }),
        /^Error: prod, preview: each environment names `deploy: push` or `deploy: release`$/,
    );
});

test('a dispatch on a branch deploys nothing and builds nothing: the cluster admits CI from the default branch and v* tags alone', () => {
    const result = plan({ manifest: manifest('staging-and-prod'), event: 'workflow_dispatch', ref: 'refs/heads/fix/probe', refName: 'fix/probe', sha: SHA, newestTag: { name: 'v1.7.2', sha: TAG_SHA } });

    assert.deepEqual(result.builds, []);
    assert.deepEqual(result.deployments, []);
    assert.deepEqual(result.untouched, [{ env: 'staging', deploy: 'push' }, { env: 'prod', deploy: 'release' }]);
});

test('a dispatch on the default branch deploys the push environments, whatever the branch is called', () => {
    const result = plan({ manifest: manifest('staging-and-prod'), event: 'workflow_dispatch', ref: 'refs/heads/trunk', refName: 'trunk', sha: SHA, newestTag: null, defaultBranch: 'trunk' });

    assert.deepEqual(result.deployments.map((d) => [d.env, d.tag, d.alias]), [['staging', 'sha-a0636b8', 'latest']]);
});
