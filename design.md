# Design

Sistema visual inspirado en una interfaz de terminal Linux con estética **Tokyo Night**, reinterpretada con acentos pastel, transparencias suaves y una base azul-gris muy oscura.

La interfaz debe sentirse **técnica, compacta, sobria y personal**, evitando superficies demasiado brillantes o colores saturados. Los colores pastel funcionan principalmente como semántica y jerarquía, mientras que los neutros oscuros sostienen la composición.

---

## Paleta de colores

Paleta inspirada en el estilo "Tokyo Night" / temas pastel suaves sobre fondo oscuro.

| Hex       | Vista previa | Descripción                |
| --------- | ------------ | -------------------------- |
| `#51576c` | ▇▇▇          | Gris azulado oscuro        |
| `#e98186` | ▇▇▇          | Rojo coral                 |
| `#a6d28a` | ▇▇▇          | Verde salvia               |
| `#e6c890` | ▇▇▇          | Amarillo dorado / arena    |
| `#8caaec` | ▇▇▇          | Azul cielo                 |
| `#f2b9e5` | ▇▇▇          | Rosa pastel                |
| `#82c8be` | ▇▇▇          | Verde azulado (teal)       |
| `#b5bfe2` | ▇▇▇          | Azul lavanda claro         |

### Definiciones (CSS / TS)

```ts
export const colors = {
  base:    "#51576c", // gris azulado oscuro - neutro / bordes / texto secundario
  red:     "#e98186", // rojo coral - errores / cerrado / peligro
  green:   "#a6d28a", // verde salvia - éxito / abierto / ok
  yellow:  "#e6c890", // amarillo dorado - advertencias / filtrado / pendiente
  blue:    "#8caaec", // azul cielo - info / primario / acento
  pink:    "#f2b9e5", // rosa pastel - resaltado / decorativo
  teal:    "#82c8be", // teal - informativo secundario / categorías
  lavender:"#b5bfe2", // azul lavanda - texto claro / fondos suaves
} as const;
```

> Toda la UI se compone exclusivamente a partir de estos 8 colores. No se introducen neutros adicionales, escalas de grises ni tonos extra.

---

## Roles semánticos

Los colores se eligen por intención, no únicamente por decoración.

| Rol | Color | Aplicación |
| --- | ----- | ---------- |
| Primario / acción | `#8caaec` | Links, acciones principales, focus |
| Éxito | `#a6d28a` | Estados OK, online, completado |
| Advertencia | `#e6c890` | Pending, atención, recursos limitados |
| Error / peligro | `#e98186` | Error, fallo, acciones destructivas |
| Información secundaria | `#82c8be` | Tags, categorías, datos técnicos |
| Destacado | `#f2b9e5` | Encabezados, keywords, valores importantes |
| Texto claro / énfasis suave | `#b5bfe2` | Valores, subtítulos destacados |
| Neutral | `#51576c` | Bordes, separadores, estado deshabilitado |

### Regla de uso

Los acentos pastel deben aparecer en **pequeñas dosis**. Como referencia:

- 60–75% del área visual: `colors.base` y sus variantes de opacidad.
- 15–25%: `colors.lavender` para texto y valores suaves.
- 5–15%: colores de acento semánticos.

No utilizar simultáneamente todos los colores saturados dentro del mismo componente salvo que se trate de una visualización deliberadamente multicolor.

---

## Tipografía

La referencia utiliza una estética inequívocamente **monoespaciada**, similar a un terminal moderno.

### Familia

Preferir:

```css
font-family:
  "JetBrains Mono",
  "Fira Code",
  "IBM Plex Mono",
  "SFMono-Regular",
  Consolas,
  "Liberation Mono",
  monospace;
```

La tipografía debe conservar:

- ancho monoespaciado;
- buena diferenciación entre `0/O`, `1/l/I`;
- números claramente legibles;
- soporte correcto de símbolos técnicos;
- apariencia compacta.

### Escala tipográfica

| Token | Tamaño | Uso |
| ----- | ------ | --- |
| `xs` | `11px` | Microtexto, indicadores |
| `sm` | `12px` | Metadatos y navegación |
| `md` | `14px` | Texto principal |
| `lg` | `16px` | Encabezados pequeños |
| `xl` | `20px` | Títulos de sección |
| `2xl` | `24px` | Títulos principales |

En interfaces inspiradas en la captura, `12px–14px` debe ser el rango predominante.

### Peso

```ts
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;
```

Usar `600–700` para nombres, encabezados y claves de información. Evitar grandes bloques en negrita.

### Line height

```ts
export const lineHeights = {
  tight: 1.2,
  normal: 1.45,
  relaxed: 1.65,
} as const;
```

Para contenido tipo terminal o datos densos, preferir `1.35–1.5`.

---

## Espaciado

El sistema usa una cuadrícula pequeña y consistente para conservar una sensación compacta.

```ts
export const spacing = {
  0: 0,
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;
```

### Uso recomendado

- `4px`: separación entre elementos íntimamente relacionados.
- `8px`: separación de labels, iconos y valores.
- `12px`: padding interno compacto.
- `16px`: padding estándar de componentes.
- `24px`: separación entre bloques.
- `32px+`: separación entre secciones.

La interfaz debe sentirse **densa pero respirable**, no excesivamente espaciosa.

---

## Bordes y radios

La referencia visual favorece bordes finos y una geometría relativamente recta.

```ts
export const radius = {
  none: "0px",
  sm: "2px",
  md: "4px",
  lg: "8px",
  pill: "999px",
} as const;

export const borders = {
  thin: "1px",
  medium: "2px",
} as const;
```

### Reglas

- Cards y paneles: `4–8px`.
- Inputs: `4px`.
- Chips/status: `999px` solo cuando se quiera enfatizar el carácter de badge.
- Evitar radios muy grandes tipo `16–24px` porque alejan la estética de terminal.
- Los bordes deben ser discretos y de bajo contraste usando `colors.base` con baja opacidad.

---

## Iconografía

La iconografía debe complementar la estética técnica.

Preferir:

- iconos lineales;
- stroke fino/medio;
- formas geométricas;
- poco relleno;
- tamaño entre `14px` y `18px`.

Colores:

```ts
export const iconColors = {
  default: colors.lavender,
  primary: colors.blue,
  success: colors.green,
  warning: colors.yellow,
  danger: colors.red,
  info: colors.teal,
  accent: colors.pink,
  muted: colors.base,
} as const;
```

No utilizar iconos con colores arbitrarios fuera del sistema.

---

## Componentes

### Syntax highlighting

```ts
export const syntax = {
  keyword: colors.pink,
  string: colors.green,
  number: colors.yellow,
  function: colors.blue,
  variable: colors.lavender,
  comment: colors.base,
  type: colors.teal,
  error: colors.red,
} as const;
```

La captura demuestra que el lenguaje visual funciona especialmente bien cuando **distintos tipos de información reciben colores distintos, pero todos pertenecen al mismo pastel apagado**.

---

### Badge / Status

Un status debe comunicar rápidamente información operacional.

```css
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1;
}
```

Variantes (fondo con alpha derivada del color de paleta, texto en color sólido):

| Variante | Fondo recomendado | Texto |
| -------- | ----------------- | ----- |
| Success | `rgba(166, 210, 138, .14)` | `#a6d28a` |
| Warning | `rgba(230, 200, 144, .14)` | `#e6c890` |
| Error | `rgba(233, 129, 134, .14)` | `#e98186` |
| Info | `rgba(130, 200, 190, .14)` | `#82c8be` |
| Primary | `rgba(140, 170, 236, .14)` | `#8caaec` |

---

### Buttons

Los botones deben ser compactos y funcionales.

#### Primary

- fondo `colors.blue`;
- texto `colors.base` (oscuro, alto contraste sobre el azul);
- hover con mayor luminosidad / opacidad reducida;
- focus con outline `colors.blue`.

#### Secondary

- fondo `colors.base`;
- texto `colors.lavender`;
- borde sutil.

#### Ghost

- fondo transparente;
- texto `colors.lavender`;
- hover con `colors.base` semi-transparente.

Evitar botones enormes, redondeados y altamente saturados.

---

## Layout

La composición de referencia utiliza grandes superficies visuales con bloques de información compactos.

### Principios

- usar `colors.base` como lienzo de fondo;
- mantener contenido principal dentro de una columna de lectura;
- reservar espacios amplios alrededor del contenido;
- combinar una zona dominante con bloques secundarios;
- evitar grids demasiado densos.

### Anchuras

```ts
export const layout = {
  contentSm: "640px",
  contentMd: "840px",
  contentLg: "1100px",
  contentXl: "1280px",
} as const;
```

Para contenido principalmente textual/técnico, `640–840px` suele ser suficiente.

---

## Alineación

La interfaz se beneficia de alineaciones estrictas.

Preferir:

- bordes y textos alineados;
- columnas con ancho consistente;
- valores numéricos alineados;
- iconos alineados al centro del texto;
- listas de datos con separación constante.

Para pares `label/value`:

```text
OS:         Gentoo Linux ppc
Host:       PowerMac6,1
Kernel:     Linux 6.18.43
Uptime:     18 hours, 18 mins
Packages:   62 (emerge)
```

El valor puede utilizar un tono más claro (`colors.lavender`) o un color semántico según su importancia.

---

## Motion

El movimiento debe ser funcional y discreto.

```ts
export const duration = {
  fast: "120ms",
  normal: "180ms",
  slow: "280ms",
} as const;

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1.15)",
} as const;
```

Usos:

- hover: `120–180ms`;
- apertura de panel: `180–280ms`;
- cambios de contenido: `180–280ms`.

Evitar rebotes, escalados exagerados y animaciones constantes.

---

## Accesibilidad

La estética pastel no debe comprometer la legibilidad.

### Reglas mínimas

- texto principal con alto contraste (`colors.lavender` sobre `colors.base`);
- no depender exclusivamente del color para estados;
- errores y warnings acompañados por icono, label o descripción;
- focus visible;
- tamaño táctil mínimo razonable;
- respetar `prefers-reduced-motion`.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Responsive

La estética debe conservarse en pantallas pequeñas, reduciendo densidad antes que perder legibilidad.

### Desktop

- paneles en paralelo cuando tenga sentido;
- tipografía `12–14px`;
- mucho espacio alrededor de la composición.

### Tablet

- reducir márgenes;
- pasar grids de múltiples columnas a `2`;
- mantener paneles con padding de `12–16px`.

### Mobile

- una sola columna;
- ocultar información secundaria antes que reducir demasiado el texto;
- padding de `12–16px`;
- fuentes nunca menores a `12px` para contenido relevante.

---

## Ejemplo de tokens completos

```ts
export const designTokens = {
  colors,
  spacing,
  radius,
  fontWeights,
  lineHeights,
  layout,

  typography: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
  },

  duration: {
    fast: "120ms",
    normal: "180ms",
    slow: "280ms",
  },
} as const;
```

---

## Principios de diseño

1. **Oscuro primero**  
   La base de la interfaz es `colors.base`. Los colores pastel son acentos.

2. **Terminal, no dashboard corporativo**  
   La UI debe sentirse técnica, directa y orientada a información, evitando cards gigantes y gradientes excesivos.

3. **Pasteles con propósito**  
   Cada color debe tener un significado semántico consistente.

4. **Alta densidad, buena legibilidad**  
   Mucha información puede convivir en poco espacio siempre que exista una jerarquía tipográfica clara.

5. **Contraste por capas**  
   La profundidad se construye con `colors.base` en distintas intensidades y bordes sutiles, no con sombras fuertes ni colores nuevos.

6. **Monoespaciado como identidad**  
   La tipografía monoespaciada no es solamente decorativa: define el carácter técnico del sistema.

7. **Precisión visual**  
   Alineaciones, espaciados y tamaños deben seguir una escala predecible.

8. **Sobriedad interactiva**  
   Hover, focus y active deben ser visibles pero discretos.

9. **Solo la paleta definida**  
   Un componente nuevo debe reutilizar los 8 tokens existentes. Nunca se introduce un color adicional.

10. **La información manda**  
    La estética debe ayudar a leer y entender datos, no competir con ellos.
