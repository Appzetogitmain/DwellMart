/**
 * Button Prop Types & Specification
 * 
 * @typedef {Object} ButtonProps
 * @property {React.ElementType} [as='button'] - Polymorphic component (button, Link, 'a')
 * @property {'primary'|'secondary'|'outline'|'danger'|'ghost'} [variant='primary']
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
export const BUTTON_VARIANTS = ['primary', 'secondary', 'outline', 'danger', 'ghost'];
export const BUTTON_SIZES = ['sm', 'md', 'lg'];
