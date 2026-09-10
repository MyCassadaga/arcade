export type PostIoAuthorization<TObject, TAuthorization> =
  | { object: null }
  | { object: TObject; authorization: TAuthorization };

export async function readThenRevalidate<TObject, TAuthorization>(
  read: () => Promise<TObject | null>,
  revalidate: () => TAuthorization | Promise<TAuthorization>
): Promise<PostIoAuthorization<TObject, TAuthorization>> {
  const object = await read();
  if (object === null) return { object: null };
  return { object, authorization: await revalidate() };
}
