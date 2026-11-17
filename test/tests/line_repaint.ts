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
