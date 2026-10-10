type Fn<A, B> = (value: A) => B;

export function pipe<A, B>(value: A, ab: Fn<A, B>): B;

export function pipe<A, B, C>(value: A, ab: Fn<A, B>, bc: Fn<B, C>): C;

export function pipe<A, B, C, D>(
  value: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
): D;

export function pipe<A, B, C, D, E>(
  value: A,
  ab: Fn<A, B>,
  bc: Fn<B, C>,
  cd: Fn<C, D>,
  de: Fn<D, E>,
): E;

export function pipe(
  value: unknown,
  ...fns: Array<(value: any) => any>
): unknown {
  return fns.reduce((value, fn) => fn(value), value);
}
