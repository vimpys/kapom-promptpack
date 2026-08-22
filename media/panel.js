// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  const task = /** @type {HTMLTextAreaElement} */ (document.getElementById('task'));
  const files = /** @type {HTMLUListElement} */ (document.getElementById('files'));
  const empty = /** @type {HTMLParagraphElement} */ (document.getElementById('empty'));
  const total = /** @type {HTMLSpanElement} */ (document.getElementById('total'));
  const copy = /** @type {HTMLButtonElement} */ (document.getElementById('copy'));

  const send = (type, value) => {
    vscode.postMessage(value === undefined ? { type } : { type, value });
  };

  // Typing should not fire a message per keystroke; the extension re-reads
  // every file whenever state changes.
  let pending;
  task.addEventListener('input', () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      send('task', task.value);
    }, 250);
  });

  document.getElementById('pin').addEventListener('click', () => {
    send('pinActive');
  });
  document.getElementById('add').addEventListener('click', () => {
    send('addFiles');
  });
  document.getElementById('clear').addEventListener('click', () => {
    send('clear');
  });
  copy.addEventListener('click', () => {
    send('copy');
  });

  const format = (n) => n.toLocaleString('en-US');

  const render = (state) => {
    // Leave the box alone while it has focus, or the caret jumps mid-sentence.
    if (document.activeElement !== task && task.value !== state.task) {
      task.value = state.task;
    }

    files.replaceChildren();

    for (const file of state.files) {
      const li = document.createElement('li');

      if (file.live) {
        li.className = 'live';
        li.title = file.path + ' — follows the focused editor';
      } else {
        li.title = file.path;
      }

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = file.path;

      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = format(file.tokens);

      li.append(name, count);

      if (!file.live) {
        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remove';
        remove.addEventListener('click', () => {
          send('unpin', file.key);
        });
        li.append(remove);
      }

      files.append(li);
    }

    empty.hidden = state.files.length > 0;
    total.textContent = state.files.length === 0 ? '' : format(state.totalTokens) + ' tokens';
    copy.disabled = state.files.length === 0;
  };

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'state') {
      render(event.data.state);
    }
  });
}());
