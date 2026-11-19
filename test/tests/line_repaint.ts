import * as React from 'react';
import BlockComponent from '../../src/assets/ts/components/block';
import { CursorsInfoTree } from '../../src/assets/ts/cursor';
import SessionComponent from '../../src/assets/ts/components/session';
import Path from '../../src/assets/ts/path';
import { InMemorySession } from '../../src/assets/ts/session';

function assertEqual(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

describe('outline text repaint notifications', function() {
  it('refreshes existing rows on replacement and streaming, and unsubscribes on unmount', async function() {
    const session = new InMemorySession();
    await session.document.load(['Agent status [starting]', '…']);
    const paths = await session.document.getChildren(Path.root());
    const component = new SessionComponent({session});
    const rendered: Array<Array<string>> = [];
    // Observe the cache the component would render, without mounting a browser DOM.
    Object.assign(component, {update: () => {
      rendered.push(paths.map(path => session.document.cache.get(path.row)!.line.join('')));
    }});
    component.componentDidMount();
    try {
      await session.document.setLine(paths[0].row, 'Agent status [running]'.split(''));
      await session.document.setLine(paths[1].row, 'H'.split(''));
      await session.document.setLine(paths[1].row, 'Hi'.split(''));
      assertEqual(rendered, [
        ['Agent status [starting]', '…'],
        ['Agent status [running]', '…'],
        ['Agent status [running]', 'H'],
        ['Agent status [running]', 'Hi'],
      ]);
      assertEqual(await session.document.getChildren(Path.root()), paths);
    } finally {
      component.componentWillUnmount();
    }
    await session.document.setLine(paths[0].row, 'Agent status [done]'.split(''));
    assertEqual(rendered.length, 4);
  });
});

describe('outline edit lock repaint', function() {
  it('repaints a Chat subtree and clears every visible lock cue on release', async function() {
    const session = new InMemorySession();
    await session.document.load([
      {text: 'Prompt', children: [{text: 'Child', children: ['Grandchild']}]},
      'Unrelated',
    ]);
    const prompt = (await session.document.getChildren(Path.root()))[0];
    const rows = await session.document.getSubtreeRows(prompt.row);
    const component = new SessionComponent({session});
    const mounted = new Map<number, BlockComponent>();
    const cues = new Map<number, boolean>();
    const visit = (element: React.ReactNode): void => {
      React.Children.forEach(element, child => {
        if (!React.isValidElement<any>(child)) { return; }
        if (child.type === BlockComponent) {
          const previous = mounted.get(child.props.path.row);
          const block = new BlockComponent(child.props);
          mounted.set(child.props.path.row, block);
          if (!previous || previous.shouldComponentUpdate(child.props)) {
            visit(block.render());
          }
        } else if (typeof child.type === 'function') {
          // Render the row wrapper, where the lock class and aria state live.
          const row = new (child.type as any)(child.props).render();
          cues.set(child.props.path.row, row.props['aria-readonly']);
          assertEqual(row.props.className.includes('node-text--locked'), row.props['aria-readonly']);
        } else {
          visit(child.props.children);
        }
      });
    };
    Object.assign(component, {
      state: {loaded: true, crumbContents: {}, cursorsTree: new CursorsInfoTree(Path.rootRow())},
      update: () => visit(component.render()),
    });
    component.componentDidMount();
    try {
      assertEqual(Array.from(cues.values()), [false, false, false, false]);
      const token = session.acquireEditLock(rows);
      assertEqual(rows.map(row => cues.get(row)), [true, true, true]);
      const sibling = (await session.document.getChildren(Path.root()))[1];
      assertEqual(cues.get(sibling.row), false);
      // No text or cursor changes: release itself must repaint every mounted row.
      session.releaseEditLock(token);
      assertEqual(Array.from(cues.values()), [false, false, false, false]);
    } finally {
      component.componentWillUnmount();
    }
  });

  it('invalidates unchanged blocks on lock acquisition and release', async function() {
    const session = new InMemorySession();
    await session.document.load([{text: 'Prompt', children: ['Agent response']}]);
    const prompt = (await session.document.getChildren(Path.root()))[0];
    const response = (await session.document.getChildren(prompt))[0];
    const component = new SessionComponent({session});
    Object.assign(component, {
      state: {loaded: true, crumbContents: {}, cursorsTree: new CursorsInfoTree(Path.rootRow())},
      update: () => undefined,
    });
    const rootProps = () => {
      const outline = component.render() as React.ReactElement<any>;
      return (outline.props.children[1] as React.ReactElement<any>).props;
    };
    component.componentDidMount();
    try {
      const initial = rootProps();
      const block = new BlockComponent(initial);
      assertEqual(block.shouldComponentUpdate(rootProps()), false);
      const token = session.acquireEditLock([response.row]);
      const locked = rootProps();
      assertEqual(block.shouldComponentUpdate(locked), true);
      const lockedBlock = new BlockComponent(locked);
      // The revision must reach nested blocks, even when their cached rows are unchanged.
      const tree = lockedBlock.render() as React.ReactElement<any>;
      const child = tree.props.children[0].props.children[0].props.children[2];
      assertEqual(child.props.editLocksVersion, locked.editLocksVersion);
      session.releaseEditLock(token);
      const released = rootProps();
      assertEqual(released.cached === locked.cached, true);
      assertEqual(lockedBlock.shouldComponentUpdate(released), true);
      assertEqual(session.isRowEditLocked(response.row), false);
      assertEqual(new BlockComponent(released).shouldComponentUpdate(rootProps()), false);
    } finally {
      component.componentWillUnmount();
    }
  });
});
