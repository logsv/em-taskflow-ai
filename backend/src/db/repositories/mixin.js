/** Copy methods from repository classes onto a target class prototype (fails on a name clash). */
export function applyMixins(target, ...sources) {
  for (const source of sources) {
    for (const name of Object.getOwnPropertyNames(source.prototype)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) {
        throw new Error(`applyMixins: ${target.name}.${name} is defined twice (${source.name})`);
      }
      Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name));
    }
  }
  return target;
}
