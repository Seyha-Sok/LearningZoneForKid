import './languages.css';
export function languageNavigation(current: 'english' | 'khmer') {
  document.querySelector('.topbar')!.insertAdjacentHTML('afterend', `<nav class="language-nav" aria-label="Learning language"><a href="./" ${current === 'english' ? 'aria-current="page"' : ''}>English</a><a href="./khmer.html" ${current === 'khmer' ? 'aria-current="page"' : ''}>Khmer <span lang="km">ខ្មែរ</span></a></nav>`);
}
