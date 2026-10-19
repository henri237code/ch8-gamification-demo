export const DEFAULT_PORTRAIT='/icons/profile-default.svg';
export function portrait(path:string|null|undefined) {
  const hasPhoto=typeof path==='string'&&path.trim().length>0;
  return {portraitUrl:hasPhoto?path:DEFAULT_PORTRAIT,hasPhoto,portraitFallbackUrl:DEFAULT_PORTRAIT};
}
