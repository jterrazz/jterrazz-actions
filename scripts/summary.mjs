#!/usr/bin/env node
// invariant: the one answer a Deploy run gives, read without opening a log: what deployed where,
// at which digest, whether it answers, what the checks said and what the image carries. Every
// job hands its facts over as a JSON report (an artifact); this renders them, and the job results
// (`needs`), into the run's Markdown summary. A missing report means its job never ran.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGES = [
    ['plan', 'Plan'],
    ['check', 'Check'],
    ['build', 'Build'],
    ['scan', 'Scan'],
    ['deploy', 'Deploy'],
    ['verify', 'Verify'],
];

const TRIGGERS = { push: 'push', schedule: 'daily rebuild', workflow_dispatch: 'manual run', pull_request: 'pull request' };

export function formatDuration(seconds) {
    if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '—';
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) return `${total}s`;
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

export function formatSize(bytes) {
    if (!bytes) return '—';
    return `${Math.round(bytes / 1_000_000)} MB`;
}

export function shortDigest(digest) {
    if (!digest) return '—';
    const [algorithm, hex] = digest.split(':');
    return hex ? `${algorithm}:${hex.slice(0, 4)}…${hex.slice(-2)}` : digest;
}

/** The next patch version after `vX.Y.Z`, or v0.1.0 when there is none yet. */
export function nextVersion(tag) {
    const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? '');
    if (!match) return 'v0.1.0';
    return `v${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

/** The first stage that did not succeed, with how it ended, or null when none failed. */
export function blockingStage(needs) {
    for (const [id, label] of STAGES) {
        const result = needs?.[id]?.result;
        if (result === 'failure' || result === 'cancelled') return { id, label, result };
    }
    return null;
}

const cell = (text) => String(text ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (header, rows) =>
    [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n');

function gateResult(gate) {
    switch (gate.outcome) {
        case 'success':
            return gate.cached ? '✓ cached' : `✓ passed${gate.note ? ` · ${gate.note}` : ''}`;
        case 'failure':
            return `✗ failed${gate.note ? ` · ${gate.note}` : ''}`;
        case 'off':
            return `— ${gate.note ?? 'off'}`;
        default:
            return '— not run';
    }
}

function probeText(probe) {
    const expected = probe.ok ? '' : ` (expected ${probe.expect.join(' or ')})`;
    return `${probe.path} ${probe.status || 'no answer'}${expected}`;
}

function deploymentState(deployment, deploy, verify, needs) {
    if (verify) {
        if (verify.superseded) return '⚠️ superseded by a newer deploy';
        const parts = [`ready ${verify.ready ?? '?'}`, ...(verify.probes ?? []).map(probeText)];
        return `${verify.outcome === 'success' ? '' : '❌ '}${parts.join(' · ')}`;
    }
    if (deploy) return deploy.outcome === 'success' ? 'rolled out · not verified' : '❌ rollout failed, rolled back';
    if (needs?.deploy?.result === 'failure') return '❌ rollout failed, rolled back';
    return '— not deployed';
}

function environmentsSection(reports, needs) {
    const { plan, builds, deploys, verifies } = reports;
    const rows = [];
    for (const deployment of plan?.deployments ?? []) {
        const build = builds.find((b) => b.tag === deployment.tag);
        const deploy = deploys.find((d) => d.env === deployment.env);
        const verify = verifies.find((v) => v.env === deployment.env);
        const url = verify?.probes?.[0]?.url;
        const promoted = verify?.promoted ? ` → ${verify.promoted}` : '';
        rows.push([
            deployment.env,
            `\`${deployment.tag}\`${promoted}`,
            build?.digest ? `\`${shortDigest(build.digest)}\`` : '—',
            url ? `[${new URL(url).host}](${url})` : '—',
            deploymentState(deployment, deploy, verify, needs),
        ]);
    }
    for (const untouched of plan?.untouched ?? []) {
        const running = untouched.deploy === 'release' ? (plan.newestTag?.name ?? '—') : 'latest';
        rows.push([untouched.env, running === '—' ? '—' : `\`${running}\``, '—', '—', 'unchanged']);
    }
    if (rows.length === 0) return '';
    return table(['Environment', 'Image', 'Digest', 'URL', 'State'], rows);
}

function checksSection(check) {
    if (!check?.gates?.length) return '';
    const rows = check.gates.map((gate) => [gate.name, gateResult(gate), gate.outcome === 'success' && gate.cached ? 'cached' : gate.seconds === undefined ? '—' : formatDuration(gate.seconds)]);
    return `### Checks\n\n${table(['Pass', 'Result', 'Duration'], rows)}`;
}

function vulnerabilityText(scan) {
    if (!scan) return '—';
    if (scan.outcome === 'error') return '⚠️ not scanned';
    const fixable = scan.fixableCritical ? ` · ${scan.fixableCritical} fixable critical` : '';
    return `${scan.critical} critical · ${scan.high} high${fixable}`;
}

function imageSection(builds, scans) {
    if (builds.length === 0) return '';
    const rows = builds.map((build) => {
        const scan = scans.find((s) => s.tag === build.tag);
        const delta = build.size && build.previousSize ? build.size - build.previousSize : 0;
        const deltaText = Math.abs(delta) >= 1_000_000 ? ` (${delta > 0 ? '+' : '−'}${formatSize(Math.abs(delta))})` : '';
        return [
            `\`${build.tag}\``,
            `${formatSize(build.size)}${deltaText}`,
            build.base ? `\`${build.base}\`` : '—',
            vulnerabilityText(scan),
            scan ? (scan.exceptions ? String(scan.exceptions) : 'none') : '—',
        ];
    });
    const details = scans
        .map((scan) => {
            const findings = scan.findings ?? [];
            const body = findings.length
                ? table(
                      ['ID', 'Severity', 'Package', 'Installed', 'Fixed in'],
                      findings.map((f) => [f.id, f.severity, f.pkg, f.installed, f.fixed || 'no fix yet']),
                  )
                : 'Nothing rated critical or high.';
            return `<details><summary>Trivy report · ${scan.tag} (${findings.length} ${findings.length === 1 ? 'entry' : 'entries'})</summary>\n\n${body}\n\n</details>`;
        })
        .join('\n\n');
    return `### Image\n\n${table(['Image', 'Size', 'Base', 'Vulnerabilities', 'Exceptions'], rows)}${details ? `\n\n${details}` : ''}`;
}

function releaseHint(plan) {
    const waiting = (plan?.untouched ?? []).filter((u) => u.deploy === 'release');
    if (waiting.length === 0 || (plan?.deployments ?? []).length === 0) return '';
    const names = waiting.map((u) => u.env).join(', ');
    const current = plan.newestTag?.name;
    const next = nextVersion(current);
    const stays = current ? `${names} stays on \`${current}\`` : `${names} has no release yet`;
    return `> ${stays}. To ship this commit: \`git tag ${next} && git push --tags\``;
}

function blockedDetail(stage, reports) {
    const { check, scans, deploys, verifies, plan } = reports;
    switch (stage.id) {
        case 'plan':
            return `The manifest (\`${plan?.manifest ?? '.infrastructure/application.yaml'}\`) could not be planned: an environment names neither \`deploy: push\` nor \`deploy: release\`. The Plan job's annotation names it.`;
        case 'check': {
            const failed = (check?.gates ?? []).filter((g) => g.outcome === 'failure').map((g) => g.name);
            return `${failed.length ? `**${failed.join(', ')}** failed` : 'The checks failed'}: nothing was deployed. The Check job's log, and the annotations on the changed lines, hold the findings.`;
        }
        case 'build':
            return 'The image did not build: nothing was pushed, nothing was deployed. The Build job’s log holds the error.';
        case 'scan': {
            const blocking = scans.flatMap((s) => (s.findings ?? []).filter((f) => f.severity === 'CRITICAL' && f.fixed));
            const rows = blocking.map((f) => [f.id, f.pkg, f.installed, f.fixed]);
            const list = rows.length ? `\n\n${table(['CVE', 'Package', 'Installed', 'Fixed in'], rows)}` : '';
            return `The image carries a critical vulnerability with a published fix, so it was deployed nowhere.${list}\n\nRebuild on a patched base or bump what carries it; a reviewed exception goes in \`.trivyignore.yaml\`, with a \`statement\` and an \`expired_at\`.`;
        }
        case 'deploy': {
            const failed = deploys.filter((d) => d.outcome !== 'success').map((d) => d.env);
            return `${failed.length ? failed.join(', ') : 'An environment'} did not roll out: Helm rolled it back, so it still runs its previous release. The Deploy job's log holds the rollout.`;
        }
        case 'verify': {
            const failed = verifies.filter((v) => v.outcome !== 'success');
            const lines = failed.map((v) => `- **${v.env}**: ready ${v.ready ?? '?'}${(v.probes ?? []).filter((p) => !p.ok).map((p) => ` · ${p.url} answered ${p.status || 'nothing'} (expected ${p.expect.join(' or ')})`).join('')}`);
            return `The release is live but does not answer as its \`studio.jterrazz.com/smoke-*\` annotations say, so its alias was not moved.${lines.length ? `\n\n${lines.join('\n')}` : ''}`;
        }
        default:
            return '';
    }
}

/** The run's Markdown summary, from every job's report and result. */
export function render(reports, needs, context = {}) {
    const { plan } = reports;
    const image = plan?.image ?? context.image ?? 'the app';
    const stage = blockingStage(needs);
    const envs = (plan?.deployments ?? []).map((d) => d.env);

    let title;
    if (stage?.result === 'failure') title = `❌ Deploy blocked at ${stage.label}`;
    else if (stage?.result === 'cancelled') title = `⚠️ Deploy cancelled at ${stage.label}`;
    else if (envs.length === 0) title = `⚪ ${image}: nothing to deploy`;
    else title = `✅ ${image} deployed to ${envs.join(', ')}`;

    const sha = plan?.sha ?? context.sha ?? '';
    const message = (context.message || plan?.message || '').split('\n')[0];
    const seconds = plan?.startedAt && context.now ? (new Date(context.now) - new Date(plan.startedAt)) / 1000 : undefined;
    const trigger = TRIGGERS[context.event ?? plan?.event] ?? context.event ?? plan?.event ?? '';
    const commit = [
        sha ? `\`${sha.slice(0, 7)}\`` : null,
        message || null,
        seconds === undefined ? null : formatDuration(seconds),
        trigger ? `${trigger}${context.actor ? ` by ${context.actor}` : ''}` : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const sections = [`## ${title}`, commit];
    if (stage) sections.push(blockedDetail(stage, reports));
    if (!stage && envs.length === 0 && plan) {
        sections.push(`No environment of \`${plan.manifest}\` deploys on a ${trigger} of \`${plan.refName}\`.`);
    }
    sections.push(environmentsSection(reports, needs), checksSection(reports.check), imageSection(reports.builds, reports.scans));
    if (!stage) sections.push(releaseHint(plan));
    return `${sections.filter(Boolean).join('\n\n')}\n`;
}

/** The check's report: every gate it was to run, in order, those it never reached marked so. */
export function checkReport(lines, expected) {
    const gates = lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
    const recorded = new Set(gates.map((gate) => gate.name));
    const missing = expected.filter((name) => !recorded.has(name)).map((name) => ({ name, outcome: 'not run' }));
    const order = (gate) => {
        const index = expected.indexOf(gate.name);
        return index === -1 ? expected.length : index;
    };
    return { gates: [...gates, ...missing].sort((a, b) => order(a) - order(b)) };
}

/** The Markdown a Check run ends on: its verdict, then the table of its passes. */
export function renderCheck(check) {
    const failed = check.gates.filter((gate) => gate.outcome === 'failure').map((gate) => gate.name);
    const title = failed.length ? `## ❌ Check failed at ${failed.join(', ')}` : '## ✅ Check passed';
    return `${title}\n\n${checksSection(check).replace('### Checks\n\n', '')}\n`;
}

/** Every report a directory holds, by kind. */
export function readReports(directory) {
    const files = readdirSync(directory).filter((name) => name.endsWith('.json'));
    const read = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8'));
    const of = (prefix) => files.filter((name) => name.startsWith(`${prefix}-`)).map(read);
    return {
        plan: files.includes('plan.json') ? read('plan.json') : undefined,
        check: files.includes('check.json') ? read('check.json') : undefined,
        builds: of('build'),
        scans: of('scan'),
        deploys: of('deploy'),
        verifies: of('verify'),
    };
}

function mainCheck() {
    const env = process.env;
    const lines = existsSync(env.GATES_FILE) ? readFileSync(env.GATES_FILE, 'utf8').split('\n') : [];
    const check = checkReport(lines, env.EXPECTED_GATES.split(','));
    writeFileSync(env.REPORT_FILE, `${JSON.stringify(check, null, 2)}\n`);
    if (env.SUMMARY === 'true' && env.GITHUB_STEP_SUMMARY) {
        writeFileSync(env.GITHUB_STEP_SUMMARY, renderCheck(check), { flag: 'a' });
    }
}

function main() {
    const env = process.env;
    const reports = readReports(env.REPORT_DIR);
    const needs = JSON.parse(env.NEEDS || '{}');
    const markdown = render(reports, needs, {
        message: env.COMMIT_MESSAGE,
        actor: env.ACTOR,
        event: env.EVENT,
        sha: env.SHA,
        image: env.IMAGE,
        now: new Date().toISOString(),
    });
    if (env.GITHUB_STEP_SUMMARY) writeFileSync(env.GITHUB_STEP_SUMMARY, markdown, { flag: 'a' });
    // value: the summary is not readable over the API; the log keeps a copy, folded.
    console.log(`::group::Summary (Markdown)\n${markdown}::endgroup::`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv[2] === 'check') mainCheck();
    else main();
}
