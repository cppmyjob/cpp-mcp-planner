# Web Dashboard

## Component Rules (MANDATORY)

1. **Standalone** - All components must be standalone (no NgModules)
2. **ViewEncapsulation.None** - Every component must set `encapsulation: ViewEncapsulation.None`
3. **BEM in SCSS** - All styles must follow BEM: `.block__element--modifier`

## BEM Pattern

```scss
.block {
  &__element { }
  &--modifier { }
}
```

**Rules:** No bare tag selectors (`i`, `span`). Use `&__icon`, `&__label` instead.
