# Tipos de Campo - Referencia Completa

Tipos aceptados por el MCP de Fyso (`fyso_schema action: "generate"` y `action: "add_field"`).

## Tipos Básicos

### text
Texto corto (nombres, títulos, códigos, descripciones cortas).

```json
{
  "name": "Nombre",
  "fieldKey": "nombre",
  "fieldType": "text",
  "isRequired": true,
  "validation": {
    "minLength": 2,
    "maxLength": 100
  }
}
```

### textarea
Texto largo multilínea (notas, descripciones extensas).

```json
{
  "name": "Descripción",
  "fieldKey": "descripcion",
  "fieldType": "textarea"
}
```

### number
Número entero o decimal. Usa `config.decimals` para controlar la precisión (`0` para enteros, `2` para moneda).

```json
{
  "name": "Cantidad",
  "fieldKey": "cantidad",
  "fieldType": "number",
  "config": { "decimals": 0 },
  "defaultValue": 0,
  "validation": {
    "min": 0,
    "max": 99999
  }
}
```

```json
{
  "name": "Precio",
  "fieldKey": "precio",
  "fieldType": "number",
  "isRequired": true,
  "config": { "decimals": 2 },
  "validation": { "min": 0 }
}
```

### boolean
Verdadero o falso.

```json
{
  "name": "Activo",
  "fieldKey": "activo",
  "fieldType": "boolean",
  "defaultValue": true
}
```

### date
Solo fecha (sin hora).

```json
{
  "name": "Fecha de Nacimiento",
  "fieldKey": "fecha_nacimiento",
  "fieldType": "date"
}
```

### email
Email con validación automática.

```json
{
  "name": "Email",
  "fieldKey": "email",
  "fieldType": "email",
  "isRequired": true
}
```

### phone
Número de teléfono.

```json
{
  "name": "Teléfono",
  "fieldKey": "telefono",
  "fieldType": "phone"
}
```

## Tipos Especiales

### select
Lista de opciones predefinidas. Las opciones van en `config.options`.

```json
{
  "name": "Estado",
  "fieldKey": "estado",
  "fieldType": "select",
  "config": {
    "options": ["pendiente", "en_proceso", "completado", "cancelado"]
  },
  "defaultValue": "pendiente"
}
```

### relation
Referencia a otra entidad (foreign key). Indica `entity` y `displayField` en `config`.

```json
{
  "name": "Cliente",
  "fieldKey": "cliente",
  "fieldType": "relation",
  "isRequired": true,
  "config": {
    "entity": "clientes",
    "displayField": "nombre"
  }
}
```

## Validaciones Comunes

### Requerido
```json
{ "isRequired": true }
```

### Único
```json
{ "isUnique": true }
```

### Rango numérico
```json
{ "validation": { "min": 0, "max": 100 } }
```

### Longitud de texto
```json
{ "validation": { "minLength": 3, "maxLength": 50 } }
```

### Patrón regex
```json
{ "validation": { "pattern": "^[A-Z]{3}[0-9]{4}$" } }
```

## Patrones de Uso Frecuente

### Precio (moneda)
```json
{
  "name": "Precio",
  "fieldKey": "precio",
  "fieldType": "number",
  "config": { "decimals": 2 },
  "display": {
    "format": "currency",
    "currency": "USD"
  }
}
```

### Porcentaje
```json
{
  "name": "Descuento",
  "fieldKey": "descuento",
  "fieldType": "number",
  "config": { "decimals": 2 },
  "display": { "format": "percentage" },
  "validation": { "min": 0, "max": 100 }
}
```
