# Галерея наград главной — awards-home

Независимая копия существующего экземпляра clients-home по прямому указанию пользователя. Разметка index.html, стили src/styles/pages/home.scss, контроллер src/scripts/pages/home.js / HomeAwardsGallery. Прежний статический .awards удалён из blocks.scss. Галереи логотипов, кейсов и исходный компонент не меняются.

Сохранены исходный H2 и все7 SVG nagr01–nagr07 с прежними alt, width/height350×350 и lazy/async. Заголовок остаётся в container, лента идёт до краёв экрана. У секции aria-labelledby="awards-home-title", окно awards-home-gallery с доступным названием и tabindex=0. Корень .awards-home[data-awards-home-gallery]; внутренние классы awards-home__viewport/track/item. Не добавлять data-horizontal-gallery или метку clients-home: контроллер должен быть один.

Режим data-gallery-mode="scroll", период data-gallery-scroll-duration="45", zoom false, без стрелок. Автоцикл, разворот по вертикальному скроллу, пауза удержанием, ручной touch/drag с инерцией и клавиатура — как у clients-home. Движение подключается через общий ScrollReel.create; не копировать код модификации. При скрытии/вне экрана цикл приостанавливается, reduced motion отключает автоцикл/инерцию; без JS/GSAP остаётся ручная лента.

Геометрия сохраняет размер контента: desktop карточка350px, квадратная пропорция SVG, зазор15px, поля --page-gutter, верхний отступ180px, от заголовка до ленты60px. До959px верхний отступ --section-space, до ленты30px, gap16px; ширина карточки по правилу галерей оставляет20px следующей. CSS --gallery-card-width/gap/padding задают desktop-параметры экземпляра. Не растягивать SVG с нарушением пропорций.

HomeAwardsGallery.init()/destroy() повторно безопасны, очистка изолирована: события/таймеры/наблюдатели/анимации/клоны и исходные атрибуты восстанавливаются. После смены контента/режима — destroy/init именно этого API. В WordPress выводить оригинальные карточки из медиатеки; служебные состояния и клоны не сохранять. Подключать JS страницы после общих модификаций.
