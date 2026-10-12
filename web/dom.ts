export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
}
export function button(label: string, handler: () => void, className = '') {
  const element = node('button', label, className); element.type = 'button'; element.addEventListener('click', handler); return element;
}
export function link(label: string, href: string) {
  const element = node('a', label); element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; return element;
}
export function tag(text: string, className = '') { return node('span', text, `tag ${className}`); }
export function pair(label: string, value: string) {
  const row = node('div', '', 'pair'); row.append(node('dt', label), node('dd', value)); return row;
}
