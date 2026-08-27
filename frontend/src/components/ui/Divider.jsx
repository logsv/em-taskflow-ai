import React from 'react';
import './Divider.css';

/**
 * Standardized Divider Component
 * @param {Object} props
 * @param {'sm' | 'md' | 'lg'} [props.spacing='md']
 * @param {string} [props.className]
 */
export function Divider({ spacing = 'md', className = '', ...rest }) {
  return (
    <hr className={`ah-divider ah-divider-spacing-${spacing} ${className}`} {...rest} />
  );
}

export default Divider;
