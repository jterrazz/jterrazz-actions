#!/usr/bin/env node
// invariant: what a Deploy run builds and where it deploys, decided from the app's manifest and
// the event alone, before anything builds. `deploy: push` environments take the default branch
// (a push, a dispatch, a schedule); `deploy: release` environments take a `v*` tag. Any other ref
// deploys nothing: the cluster admits CI only from the default branch and `v*` tags. The daily schedule
// does both: main's HEAD for the `push` environments, and the newest `v*` tag rebuilt on the
// patched base for the `release` ones. A shared app (`scope: shared`) carries one root `deploy`
// and deploys as the one environment `shared` (studio-infrastructure ADR-029).
//
// Every build is pushed as `sha-<7>`, the commit it was built from; the alias (`latest`, or the
// `v*` tag) is moved onto that digest only once the environment it serves is verified.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEPLOY_VALUES = ['push', 'release'];

/** The environments a manifest declares, as [name, deploy value] pairs, in manifest order. */
export function environmentsOf(manifest) {
    if (manifest?.scope === 'shared') {
        return [['shared', manifest.deploy]];
    }
    return Object.entries(manifest?.environments ?? {}).map(([name, env]) => [name, env?.deploy]);
}

/** Resolve the builds and deployments of one run. Throws on an environment naming neither value. */
export function plan({ manifest, event, ref, refName, sha, newestTag, defaultBranch = 'main' }) {
    const environments = environmentsOf(manifest);
    const unnamed = environments.filter(([, deploy]) => !DEPLOY_VALUES.includes(deploy)).map(([name]) => name);
    if (unnamed.length > 0) {
        throw new Error(`${unnamed.join(', ')}: each environment names \`deploy: push\` or \`deploy: release\``);
    }

    const sources = [];
    if (ref.startsWith('refs/tags/v')) {
        sources.push({ when: 'release', ref, sha, alias: refName });
    } else if (ref === `refs/heads/${defaultBranch}`) {
        sources.push({ when: 'push', ref: sha, sha, alias: 'latest' });
    }
    if (event === 'schedule' && newestTag?.name && newestTag?.sha) {
        sources.push({ when: 'release', ref: `refs/tags/${newestTag.name}`, sha: newestTag.sha, alias: newestTag.name });
    }

    const deployments = [];
    for (const source of sources) {
        for (const [env, deploy] of environments) {
            if (deploy !== source.when) continue;
            const short = source.sha.slice(0, 7);
            deployments.push({ env, sha: source.sha, short, tag: `sha-${short}`, alias: source.alias, ref: source.ref });
        }
    }

    // value: one build per commit: a schedule whose main HEAD is the newest tag builds it once.
    const builds = [];
    for (const deployment of deployments) {
        if (builds.some((build) => build.sha === deployment.sha)) continue;
        builds.push({ sha: deployment.sha, short: deployment.short, tag: deployment.tag, ref: deployment.ref, alias: deployment.alias });
    }

    const untouched = environments
        .filter(([env]) => !deployments.some((deployment) => deployment.env === env))
        .map(([env, deploy]) => ({ env, deploy }));

    return { builds, deployments, untouched, environments: environments.map(([env, deploy]) => ({ env, deploy })) };
}

function main() {
    const env = process.env;
    const manifest = JSON.parse(readFileSync(env.MANIFEST_JSON, 'utf8'));
    const newestTag = env.NEWEST_TAG ? { name: env.NEWEST_TAG, sha: env.NEWEST_TAG_SHA } : null;
    let result;
    try {
        result = plan({ manifest, event: env.EVENT, ref: env.REF, refName: env.REF_NAME, sha: env.SHA, newestTag, defaultBranch: env.DEFAULT_BRANCH || 'main' });
    } catch (error) {
        console.log(`::error file=${env.MANIFEST}::${error.message}`);
        process.exit(1);
    }
    const report = {
        image: env.IMAGE,
        manifest: env.MANIFEST,
        event: env.EVENT,
        ref: env.REF,
        refName: env.REF_NAME,
        sha: env.SHA,
        message: env.COMMIT_MESSAGE ?? '',
        newestTag,
        startedAt: new Date().toISOString(),
        ...result,
    };
    writeFileSync(env.PLAN_FILE, `${JSON.stringify(report, null, 2)}\n`);
    if (env.GITHUB_OUTPUT) {
        writeFileSync(
            env.GITHUB_OUTPUT,
            `builds=${JSON.stringify(result.builds)}\ndeployments=${JSON.stringify(result.deployments)}\n`,
            { flag: 'a' },
        );
    }
    if (result.deployments.length === 0) {
        console.log(`Nothing deploys on this ${env.EVENT} of ${env.REF}.`);
    }
    for (const deployment of result.deployments) {
        console.log(`${deployment.env}: ${deployment.tag} from ${deployment.ref}, then ${deployment.alias}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
