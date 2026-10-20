# Бегущая галерея

Объединена с компонентом «Горизонтальная галерея». Актуальные разметка, четыре режима, параметры, внешние стрелки, адаптивность и API: [horizontal-gallery.md](horizontal-gallery.md). Отдельной реализации больше нет. Старое имя JS API сохранено как псевдоним HorizontalGallery.

Текущее размещение базовых single-image/horizontal-gallery: библиотека [Blocks](../Blocks/README.md), её [инструкции](../Blocks/AGENTS.md). Собственный контроллер галереи перенесён в Blocks/blocks.js, стили — Blocks/blocks.scss → Blocks/blocks.css. Эффекты ImageViewer/PhotoParallax/ScrollReel остаются в Modifications и подключаются к блокам.
