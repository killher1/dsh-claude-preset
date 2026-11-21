/**
 * Claude Code agent preset: replaces the deployment persona and the harness
 * identity line with the prompt this bundle ships, and shadows DeepSeek Harness
 * tools that have Claude Code equivalents on each bound agent's child scope
 * (`agent.ctx.tools.register`) while leaving DSH-only tools and sections intact.
 *
 * Why `agent.ctx` instead of the preset scope: every plugin inside
 * `preset-claude-code` shares one preset scope layer, so registering duplicate
 * tool names or `tool:*` prompt sections directly in `ctx` throws a same-layer
 * collision error. Every live `Agent` bound to this preset owns a child scope
 * `agent.ctx` (`bindScopeParent(agent, presetScopeKey)`), where registrations
 * cleanly shadow the preset layer without altering DSH internals or other presets.
 *
 * `complete` stays false on purpose. A complete section suppresses every other
 * section, including DSH-only capabilities (apply_patch, goal, schedule, jobs,
 * workflow, office) that Claude Code never had.
 * @module dsh-claude-preset
 */

import { CLAUDE_CODE_PROMPT } from './prompt-text.js';
import { SHADOWED_PROMPT_SECTIONS, TOOL_DESCRIPTION_BUILDERS } from './tool-descriptions.js';

/** Cordis plugin name. */
export const name = 'claude-code-prompt';

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt'];

const PRESET_ID = 'claude-code';

/** Safely invoke a Cordis disposer even if its owning scope has already unwound. */
function safeDispose(dispose) {
  if (typeof dispose !== 'function') return;
  try {
    dispose();
  } catch {
    // Scope may already be disposed during agent teardown or plugin reload.
  }
}

/**
 * Register the Claude Code prompt sections and scoped tool-description shadows.
 * @param ctx - an agent-scope context owned by the selected preset revision.
 */
export function apply(ctx) {
  // Empty text is dropped at render, so this only removes the harness identity line.
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'harness:identity',
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    text: '',
  }), 'claude-code-prompt.identity()');

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'deployment:persona-prefix',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    // Literal prose: the text is shipped verbatim, so no {{variable}} scanning.
    text: CLAUDE_CODE_PROMPT,
    interpolate: false,
  }), 'claude-code-prompt.persona()');

  ctx.inject(['tools', 'agents', 'agentPresets'], (shadowCtx) => {
    /** Map<Agent, { tools: Map<string, { baseDef, dispose }>, sections: Array<() => void>, cleanupRegistered: boolean }> */
    const tracked = new Map();
    let disposed = false;
    let syncing = 0;
    let changeScheduled = false;
    let queue = Promise.resolve();

    const enqueue = (task) => {
      const run = queue.then(() => {
        if (disposed) return undefined;
        return task();
      });
      queue = run.catch(() => undefined);
      return run;
    };

    const withPresetKey = async (fn) => {
      const lease = await shadowCtx.agentPresets.acquireScope(PRESET_ID);
      try {
        if (disposed) return undefined;
        return await fn(lease.key);
      } finally {
        await lease[Symbol.asyncDispose]();
      }
    };

    const getRegistrationOptions = (toolName) => {
      if (toolName === 'web_fetch') {
        return {
          when: ({ modelSelection }) => Boolean(shadowCtx.get('web')?.fetchReady(modelSelection.provider)),
        };
      }
      if (toolName === 'web_search') {
        return {
          when: ({ modelSelection }) => Boolean(shadowCtx.get('web')?.searchReady(modelSelection.provider)),
        };
      }
      return {};
    };

    const detachAgent = (agent) => {
      const entry = tracked.get(agent);
      if (entry === undefined) return;
      tracked.delete(agent);
      for (const record of entry.tools.values()) safeDispose(record.dispose);
      entry.tools.clear();
      for (const disposeSection of entry.sections) safeDispose(disposeSection);
      entry.sections.length = 0;
    };

    const applySections = (agent, entry) => {
      if (entry.sections.length > 0) return;
      for (const { name: sectionName, orderKey } of SHADOWED_PROMPT_SECTIONS) {
        try {
          const dispose = agent.ctx.systemPrompt.section({
            name: sectionName,
            order: shadowCtx.systemPrompt.getSectionOrder(orderKey),
            text: '',
          });
          entry.sections.push(dispose);
        } catch (error) {
          shadowCtx.logger.warn(`claude-code-prompt: failed to shadow section "${sectionName}": ${String(error)}`);
        }
      }
    };

    const syncAgentsWithKey = (agents, presetKey) => {
      if (disposed || presetKey === undefined) return;
      syncing++;
      try {
        for (const agent of agents) {
          if (disposed) return;
          if (shadowCtx.agentPresets.composedPreset(agent.ctx) !== PRESET_ID) {
            detachAgent(agent);
            continue;
          }
          let entry = tracked.get(agent);
          if (entry === undefined) {
            entry = { tools: new Map(), sections: [], cleanupRegistered: false };
            tracked.set(agent, entry);
          }
          if (!entry.cleanupRegistered) {
            entry.cleanupRegistered = true;
            try {
              agent.ctx.effect(() => () => {
                tracked.delete(agent);
              }, 'claude-code-prompt.agent-cleanup');
            } catch {
              // Ignore if agent.ctx is already tearing down.
              detachAgent(agent);
              continue;
            }
          }
          applySections(agent, entry);
          for (const [toolName, buildDescription] of Object.entries(TOOL_DESCRIPTION_BUILDERS)) {
            const baseDef = shadowCtx.tools.get(toolName, presetKey);
            const prev = entry.tools.get(toolName);
            if (baseDef === prev?.baseDef) continue;
            if (prev !== undefined) {
              safeDispose(prev.dispose);
              entry.tools.delete(toolName);
            }
            if (baseDef !== undefined) {
              const shadowedDef = {
                ...baseDef,
                description: buildDescription(baseDef),
              };
              const dispose = agent.ctx.tools.register(shadowedDef, getRegistrationOptions(toolName));
              entry.tools.set(toolName, { baseDef, dispose });
            }
          }
        }
      } finally {
        syncing--;
      }
    };

    shadowCtx.on('agent/created', async ({ agent }) => {
      await enqueue(() => withPresetKey((key) => syncAgentsWithKey([agent], key)));
    });

    shadowCtx.on('session/event', (session, event) => {
      if (disposed || event?.type !== 'agent-preset/selected') return;
      const agent = shadowCtx.agents.get(session.id);
      if (agent === undefined) return;
      if (shadowCtx.agentPresets.composedPreset(agent.ctx) !== PRESET_ID) {
        syncing++;
        try {
          detachAgent(agent);
        } finally {
          syncing--;
        }
        return;
      }
      void enqueue(() => withPresetKey((key) => syncAgentsWithKey([agent], key))).catch((error) => {
        shadowCtx.logger.warn(`claude-code-prompt: failed to sync shadows on preset select: ${String(error)}`);
      });
    });

    shadowCtx.on('tools/change', () => {
      if (disposed || syncing > 0 || tracked.size === 0 || changeScheduled) return;
      changeScheduled = true;
      queueMicrotask(() => {
        changeScheduled = false;
        if (disposed || tracked.size === 0) return;
        const remaining = [];
        syncing++;
        try {
          for (const agent of [...tracked.keys()]) {
            if (shadowCtx.agentPresets.composedPreset(agent.ctx) !== PRESET_ID) {
              detachAgent(agent);
            } else {
              remaining.push(agent);
            }
          }
        } finally {
          syncing--;
        }
        if (remaining.length === 0) return;
        void enqueue(() => withPresetKey((key) => syncAgentsWithKey(remaining, key))).catch((error) => {
          shadowCtx.logger.warn(`claude-code-prompt: failed to sync shadows on tools/change: ${String(error)}`);
        });
      });
    });

    shadowCtx.on('agent/disposed', ({ agent }) => {
      syncing++;
      try {
        detachAgent(agent);
      } finally {
        syncing--;
      }
    });

    shadowCtx.effect(() => () => {
      disposed = true;
      syncing++;
      try {
        for (const agent of [...tracked.keys()]) {
          detachAgent(agent);
        }
      } finally {
        syncing--;
      }
    }, 'claude-code-prompt.shadow-cleanup');

    // Attach to any already-live agents after apply() finishes (never acquireScope synchronously in apply()).
    queueMicrotask(() => {
      if (disposed) return;
      const live = shadowCtx.agents.list().filter(
        (agent) => shadowCtx.agentPresets.composedPreset(agent.ctx) === PRESET_ID,
      );
      if (live.length === 0) return;
      void enqueue(() => withPresetKey((key) => syncAgentsWithKey(live, key))).catch((error) => {
        shadowCtx.logger.warn(`claude-code-prompt: failed to attach live agents: ${String(error)}`);
      });
    });
  });
}
