/**
 * Button Prop Types & Specification
 * 
 * @typedef {Object} ButtonProps
 * @property {React.ElementType} [as='button'] - Polymorphic component (button, Link, 'a')
 * @property {'primary'|'secondary'|'outline'|'danger'|'ghost'|'icon'|'success'} [variant='primary']
 * @property {'neutral'|'primary'|'danger'|'success'|'warning'} [tone='neutral'] - Color modifier for ghost/icon
 * @property {'sm'|'md'|'lg'} [size='md']
 * @property {boolean} [fullWidth=false]
 * @property {boolean} [isLoading=false]
 * @property {boolean} [disabled=false]
 * @property {React.ReactNode} [leftIcon]
 * @property {React.ReactNode} [rightIcon]
 * @property {'button'|'submit'|'reset'} [type='button']
 * @property {string} [className='']
 * @property {Function} [onClick]
 */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'outline', 'danger', 'ghost', 'icon', 'success'];
export const BUTTON_TONES = ['neutral', 'primary', 'danger', 'success', 'warning'];
export const BUTTON_SIZES = ['sm', 'md', 'lg'];
