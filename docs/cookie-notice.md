# Плашка Cookie

Компонент cookie-notice находится в Blocks: [шаблон](../Blocks/templates/cookie-notice.html), blocks.scss/blocks.js, секция03. [Методика компонентов и экземпляров](../Blocks/METHODOLOGY.md) обязательна. На трёх страницах используются отдельные экземпляры cookie-notice-home/cases/brodeks, их SCSS/JS находятся в src/styles/pages и src/scripts/pages.

Белая плашка закреплена снизу слева; на узком экране кнопка под текстом, от768px справа. Считанные fluid-размеры и точки375/768/1280/1440/1921px сохранены. Отдельная слабая тень помогает различать белую плашку на белой странице; ширина дополнительно ограничена экраном, чтобы поместиться на320px. Шрифт — наш NTSomic. Заголовок Cookies, декоративная иконка, текст и настоящая ссылка на действующую политику сайта. Кнопка использует button и параметры шапки: фон --color-text, высота59px, горизонтальные поля26px, радиус18px. Класс site-header__brief не копируется, чтобы его мобильное скрытие не затронуло кнопку.

Появление: translateY120%→0 за900ms, cubic-bezier(.33,1,.68,1). Скрытие: 0→120% за600ms, cubic-bezier(.32,0,.67,0), без изменения opacity. После скрытия hidden. WAAPI, GSAP не требуется; при отсутствии WAAPI/reduced motion переключение мгновенное. Показ после входящего перехода ждёт page-transition:ready; при обычном открытии запускается после DOM. Фокус автоматически не захватывается; при показе из примера возвращается на кнопку вызова. Нет ловушки фокуса и блокировки сайта.

## Подключение и настройки

Компонент: aside.cookie-notice[data-cookie-notice], уникальные ID и aria-labelledby, внутри data-cookie-notice-accept. Полный пример — в шаблоне. Библиотечный API CookieNotice.init()/destroy()/show(id). Для настоящей страницы создать экземпляр и своё имя/маркер по методике; текущие API HomeCookieNotice / CasesCookieNotice / BrodeksCookieNotice имеют те же методы.

- data-cookie-notice-preview на корне: не показывать автоматически и не сохранять подтверждение. Для каталога/проверки.
- data-cookie-notice-show="ID" на button: повторно показать выбранную плашку. В каталоге ID cookie-notice-demo.
- Текст, ссылка, заголовок и подпись кнопки — обычный HTML.
- Размеры, отступы, тайминги и срок хранения — константы CSS/JS, публичных атрибутов для них нет.
- Служебных классов/inline-обработчиков для подключения не нужно. Иконка — Blocks/images/cookie.svg, декоративный alt="".

Подтверждение хранится365дней: grammers_cookie_notice=accepted, Path=/, SameSite=Lax, Secure наHTTPS. Резерв для file:// или заблокированных cookie — localStorage grammers:cookie-notice с expires. Если оба хранилища недоступны, закрытие работает на текущей странице, после перезагрузки уведомление повторится. Режим примера ничего не сохраняет. Плашка не подключает аналитику/внешние трекеры; её состояние само по себе не реализует менеджер согласий для ещё не добавленных систем.

Очистка отменяет анимацию/обработчики, восстанавливает исходные hidden/disabled. init повторно безопасен; для динамических экземпляров destroy/init соответствующего контроллера. БезJS hidden-плашка не появляется, основной сайт доступен. Общие файлы компонента и код конкретного экземпляра не должны запускаться на одном корне одновременно.

## Текущие экземпляры

| Страница | Класс / корневая метка | Контроллер |
| --- | --- | --- |
| index.html | cookie-notice-home / data-cookie-notice-home | HomeCookieNotice |
| cases.html | cookie-notice-cases / data-cookie-notice-cases | CasesCookieNotice |
| case.html | cookie-notice-brodeks / data-cookie-notice-brodeks | BrodeksCookieNotice |
| Blocks/index.html | cookie-notice / data-cookie-notice, preview | CookieNotice |
