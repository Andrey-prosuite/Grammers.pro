import $ from 'jquery';

export function initSiteHeaders(root = document) {
  $(root).find('[data-site-header]:not([data-enhanced])').each(function () {
    const $header = $(this);
    const $toggle = $header.find('.site-header__toggle');
    const $nav = $header.find('.site-header__nav');
    if (!$toggle.length || !$nav.length) return;

    const setOpen = (open) => {
      if (open) $header.attr('data-open', '');
      else $header.removeAttr('data-open');
      $toggle.attr('aria-expanded', String(open));
    };

    $toggle.prop('hidden', false);
    $header.attr('data-enhanced', '');
    $toggle.on('click.siteHeader', () => setOpen(!$header.is('[data-open]')));
    $header.on('keydown.siteHeader', (event) => {
      if (event.key === 'Escape' && $header.is('[data-open]')) {
        setOpen(false);
        $toggle[0].focus();
      }
    });
    $nav.on('click.siteHeader', 'a', () => setOpen(false));
  });
}
