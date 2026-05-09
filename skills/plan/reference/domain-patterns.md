# Domain Patterns — Common Entity & Rule Patterns

Use this reference when designing Fyso apps. These patterns cover the most common business domains.

## Healthcare / Clinic

### Entities
- **pacientes** — nombre, apellido, dni(unique), fecha_nacimiento, obra_social, telefono, email, activo(boolean, default:true), notas
- **profesionales** — nombre, matricula(unique), especialidad, telefono, email, activo(boolean)
- **sesiones** — paciente(rel→pacientes), profesional(rel→profesionales), fecha(date, required), hora(text), duracion_min(number, default:30), estado(select: programada/confirmada/completada/cancelada), notas_clinicas, monto(number, decimals:2)
- **facturas** — paciente(rel→pacientes), sesion(rel→sesiones), fecha(date), subtotal(number), iva(number), total(number), estado(select: borrador/emitida/pagada/anulada)

### Common Rules
- Compute: edad from fecha_nacimiento
- Compute: total = subtotal + iva, iva = subtotal * 0.21
- Validate: email format
- Validate: fecha sesion not in past

### Frontend Flow

**Journey: Schedule a session**
1. Pick patient → `GET /api/entities/pacientes/records?filters=activo = true&sort=nombre&limit=50`
2. Pick professional → `GET /api/entities/profesionales/records?filters=activo = true`
3. Submit form → `POST /api/entities/sesiones/records` with `{ paciente, profesional, fecha, hora, duracion_min, estado: "programada", monto }`
4. Show upcoming sessions with names → `GET /api/entities/sesiones/records?resolve_depth=1&filters=fecha >= <today>&sort=fecha`

**Journey: Bill a session**
1. Create factura in `borrador` → `POST /api/entities/facturas/records` with `{ paciente, sesion, fecha, subtotal, estado: "borrador" }`
2. Refetch to display computed `iva` and `total` (with related paciente/sesion) → `GET /api/entities/facturas/records/:id?resolve_depth=1`
3. Mark emitted → `PUT /api/entities/facturas/records/:id` with `{ estado: "emitida" }`

**Pitfalls:**
- Without `?resolve_depth=1`, the sessions list shows `paciente` and `profesional` as UUIDs.
- `factura.iva` and `factura.total` are computed by rules — render them read-only and refetch after `POST` instead of computing in the form.
- "Past date" rejection comes back as `BUSINESS_RULE_ERROR` — surface the message inline on the `fecha` field.

---

## Retail / Store

### Entities
- **productos** — nombre, sku(unique), categoria(select), precio(number, decimals:2), costo(number, decimals:2), stock(number, decimals:0), stock_minimo(number, default:10), activo(boolean)
- **clientes** — nombre, email(email), telefono(phone), direccion, notas
- **ventas** — cliente(rel→clientes), fecha(date), subtotal(number), descuento(number), iva(number), total(number), estado(select: pendiente/completada/anulada), metodo_pago(select: efectivo/tarjeta/transferencia)
- **detalle_venta** — venta(rel→ventas), producto(rel→productos), cantidad(number), precio_unitario(number), subtotal(number)

### Common Rules
- Compute: detalle subtotal = cantidad * precio_unitario
- Compute: venta total = subtotal - descuento + iva
- Compute: bajo_stock = stock < stock_minimo
- Validate: cantidad > 0
- Validate: stock >= 0

### Frontend Flow

**Journey: Build and close a sale**
1. Search products to add → `GET /api/entities/productos/records?filters=activo = true AND nombre contains <q>&limit=20`
2. Create venta header → `POST /api/entities/ventas/records` with `{ cliente, fecha, estado: "pendiente", metodo_pago, descuento }`
3. For each line → `POST /api/entities/detalle_venta/records` with `{ venta, producto, cantidad, precio_unitario }` (`subtotal` computed by rule)
4. Refetch venta to read recomputed total → `GET /api/entities/ventas/records/:id`
5. Close → `PUT /api/entities/ventas/records/:id` with `{ estado: "completada" }`

**Journey: Show cart with product names**
- `GET /api/entities/detalle_venta/records?filters=venta = <id>&resolve_depth=1` — read `row.producto.nombre` after resolve.

**Pitfalls:**
- `bajo_stock` is computed and not filterable server-side — fetch products and flag low stock client-side from `stock` and `stock_minimo`.
- `venta.total` is recomputed by rules after each line insert/update; refetch instead of summing in the UI to stay consistent with the server.
- Server filters are AND-only. To show "active OR featured" fetch the active subset and union client-side.

---

## Services / Consulting

### Entities
- **clientes** — nombre, empresa, email, telefono, direccion
- **proyectos** — cliente(rel→clientes), nombre, descripcion, fecha_inicio(date), fecha_fin(date), presupuesto(number), estado(select: propuesta/activo/completado/cancelado)
- **tareas** — proyecto(rel→proyectos), descripcion, horas_estimadas(number), horas_reales(number), estado(select: pendiente/en_progreso/completada), prioridad(select: baja/media/alta/urgente)
- **facturas** — cliente(rel→clientes), proyecto(rel→proyectos), fecha(date), subtotal(number), iva(number), total(number), estado(select: borrador/emitida/pagada)

### Common Rules
- Compute: factura total = subtotal + iva
- Compute: proyecto horas_total = sum of tareas horas_reales (requires after_save action)
- Validate: fecha_fin >= fecha_inicio
- Validate: horas_estimadas > 0

### Frontend Flow

**Journey: Track project hours**
1. List active projects with client name → `GET /api/entities/proyectos/records?filters=estado = activo&resolve_depth=1`
2. Open a project → list its tasks → `GET /api/entities/tareas/records?filters=proyecto = <id>&sort=createdAt`
3. Update a task → `PUT /api/entities/tareas/records/:id` with `{ horas_reales, estado: "completada" }`
4. Refetch project to show updated `horas_total` → `GET /api/entities/proyectos/records/:id`

**Journey: Issue project invoice**
1. `POST /api/entities/facturas/records` with `{ cliente, proyecto, fecha, subtotal, estado: "borrador" }`
2. Refetch to read computed `iva` / `total` → `GET /api/entities/facturas/records/:id`

**Pitfalls:**
- `proyecto.horas_total` only updates via the `after_save` action on `tareas`. The project record returned right before the action runs may still be stale — refetch after each task save.
- Tasks list won't show project name without `resolve_depth=1` (or render against the in-memory project object you already have).
- Validate `fecha_fin >= fecha_inicio` client-side; server rejects with `BUSINESS_RULE_ERROR` but immediate UX is better.

---

## Restaurant

### Entities
- **platos** — nombre, categoria(select: entrada/principal/postre/bebida), precio(number), disponible(boolean, default:true), tiempo_preparacion(number)
- **mesas** — numero(number, unique), capacidad(number), estado(select: libre/ocupada/reservada)
- **pedidos** — mesa(rel→mesas), fecha(date), hora(text), total(number), estado(select: abierto/en_preparacion/servido/cerrado), mesero(text)
- **detalle_pedido** — pedido(rel→pedidos), plato(rel→platos), cantidad(number), precio_unitario(number), subtotal(number), notas(text)
- **pagos** — pedido(rel→pedidos), fecha(date), monto(number), metodo(select: efectivo/tarjeta/transferencia)

### Common Rules
- Compute: detalle subtotal = cantidad * precio_unitario
- Validate: cantidad > 0
- Validate: plato disponible == true
- Validate: monto pago > 0

### Frontend Flow

**Journey: Open a table and take an order**
1. Pick a free table → `GET /api/entities/mesas/records?filters=estado = libre&sort=numero`
2. Create pedido → `POST /api/entities/pedidos/records` with `{ mesa, fecha, hora, estado: "abierto", mesero }`
3. Mark mesa occupied → `PUT /api/entities/mesas/records/:mesa_id` with `{ estado: "ocupada" }`
4. Browse menu — only available items → `GET /api/entities/platos/records?filters=disponible = true&sort=categoria`
5. For each item → `POST /api/entities/detalle_pedido/records` with `{ pedido, plato, cantidad, precio_unitario, notas }` (`subtotal` computed by rule)

**Journey: Add items to an existing order**
1. Find the open pedido for the table → `GET /api/entities/pedidos/records?filters=mesa = <id> AND estado != cerrado&resolve_depth=1`
2. Show current lines with plato names → `GET /api/entities/detalle_pedido/records?filters=pedido = <id>&resolve_depth=1` — read `row.plato.nombre`
3. Append more lines → `POST /api/entities/detalle_pedido/records`
4. Refetch pedido to display the recomputed total → `GET /api/entities/pedidos/records/:id`

**Journey: Pay and close**
1. Refetch pedido for the outstanding total.
2. Create pago → `POST /api/entities/pagos/records` with `{ pedido, monto, metodo, fecha }`
3. Close pedido → `PUT /api/entities/pedidos/records/:id` with `{ estado: "cerrado" }`
4. Free the mesa → `PUT /api/entities/mesas/records/:mesa_id` with `{ estado: "libre" }`

**Pitfalls:**
- Filter the menu by `disponible = true` server-side, not client-side — clients should not see unavailable items at all.
- `detalle_pedido.plato` is a UUID. Always pass `?resolve_depth=1` when listing details so kitchen tickets show plato names.
- The three writes "create pago → update pedido → update mesa" are not transactional. Run them sequentially, abort on first error, and surface a partial-state warning to the cashier.
- "Still open" needs `estado != cerrado`. For "abierto OR en_preparacion" fetch the AND-compatible subset and union client-side (server filters are AND-only).
- Don't send `total` on pedido create — let the rule recompute it from detalle subtotals after each line.

---

## Repair Shop / Workshop

### Entities
- **clientes** — nombre, telefono, email, direccion
- **trabajos** — cliente(rel→clientes), descripcion, equipo(text), fecha_ingreso(date), fecha_entrega(date), estado(select: recibido/diagnostico/reparando/listo/entregado), costo_estimado(number), costo_final(number), notas
- **repuestos** — nombre, codigo(unique), precio(number), stock(number)
- **detalle_trabajo** — trabajo(rel→trabajos), repuesto(rel→repuestos), cantidad(number), precio_unitario(number), subtotal(number)

### Common Rules
- Compute: detalle subtotal = cantidad * precio_unitario
- Validate: stock >= 0
- Transform: codigo → uppercase

### Frontend Flow

**Journey: Intake a job**
1. Find or create cliente → `GET /api/entities/clientes/records?filters=telefono contains <q>` then `POST /api/entities/clientes/records` if no match.
2. Create trabajo → `POST /api/entities/trabajos/records` with `{ cliente, equipo, descripcion, fecha_ingreso, estado: "recibido", costo_estimado }`
3. As parts are added → `POST /api/entities/detalle_trabajo/records` with `{ trabajo, repuesto, cantidad, precio_unitario }`
4. Advance status → `PUT /api/entities/trabajos/records/:id` with `{ estado: "diagnostico" | "reparando" | "listo" | "entregado" }`
5. Show line items with part names → `GET /api/entities/detalle_trabajo/records?filters=trabajo = <id>&resolve_depth=1`

**Pitfalls:**
- `repuesto.codigo` is auto-uppercased by a transform. After save, refresh the form from the response — don't trust the value still in form state.
- Stock decrement is not wired by default. If the UI needs to show "stock left" after a part is consumed, add a rule; do not decrement client-side.
- `detalle_trabajo` listing without `resolve_depth=1` shows repuesto UUIDs.

---

## Inventory / Warehouse

### Entities
- **productos** — nombre, sku(unique), categoria(select), precio_costo(number), precio_venta(number), stock(number), stock_minimo(number), ubicacion(text)
- **proveedores** — nombre, contacto, email, telefono, direccion
- **compras** — proveedor(rel→proveedores), fecha(date), total(number), estado(select: pendiente/recibida/parcial)
- **movimientos** — producto(rel→productos), tipo(select: entrada/salida/ajuste), cantidad(number), fecha(date), motivo(text), referencia(text)

### Common Rules
- Compute: margen = precio_venta - precio_costo
- Compute: bajo_stock = stock < stock_minimo
- Validate: cantidad > 0 (movimientos)
- Validate: stock >= 0

### Frontend Flow

**Journey: Receive a purchase**
1. List proveedores → `GET /api/entities/proveedores/records?sort=nombre`
2. Create compra header → `POST /api/entities/compras/records` with `{ proveedor, fecha, estado: "pendiente", total }`
3. For each item received → `POST /api/entities/movimientos/records` with `{ producto, tipo: "entrada", cantidad, fecha, motivo: "compra", referencia: <compra_id> }`
4. Mark compra received → `PUT /api/entities/compras/records/:id` with `{ estado: "recibida" }`
5. Show movement history with product names → `GET /api/entities/movimientos/records?filters=referencia = <compra_id>&resolve_depth=1`

**Journey: Low-stock dashboard**
- `GET /api/entities/productos/records?limit=200` then filter `items.filter(p => p.stock < p.stock_minimo)` client-side.

**Pitfalls:**
- `bajo_stock` is computed and not stored, so it cannot be filtered server-side. Fetch with a broader filter and compute the alert client-side.
- The platform does not roll back stock on a deleted movimiento — communicate "ajuste" semantics to the operator and prefer a corrective movement over a delete.
- Movements list without `resolve_depth=1` shows producto UUIDs.

---

## Freelancer / Solo

### Entities
- **clientes** — nombre, empresa, email, telefono
- **proyectos** — cliente(rel→clientes), nombre, presupuesto(number), estado(select: propuesta/activo/completado), fecha_inicio(date), fecha_fin(date)
- **facturas** — cliente(rel→clientes), proyecto(rel→proyectos), numero(text, unique), fecha(date), subtotal(number), iva(number), total(number), estado(select: borrador/enviada/pagada/vencida)
- **pagos** — factura(rel→facturas), fecha(date), monto(number), metodo(select: transferencia/efectivo/cheque)

### Common Rules
- Compute: factura total = subtotal + iva, iva = subtotal * 0.21
- Validate: monto pago > 0

### Frontend Flow

**Journey: Invoice and collect**
1. List active proyectos → `GET /api/entities/proyectos/records?filters=estado = activo&resolve_depth=1`
2. Create factura → `POST /api/entities/facturas/records` with `{ cliente, proyecto, numero, fecha, subtotal, estado: "borrador" }` (`iva` and `total` are computed)
3. Refetch to display computed totals → `GET /api/entities/facturas/records/:id`
4. Send → `PUT /api/entities/facturas/records/:id` with `{ estado: "enviada" }`
5. On payment, create pago → `POST /api/entities/pagos/records` with `{ factura, fecha, monto, metodo }`
6. Mark factura paid → `PUT /api/entities/facturas/records/:id` with `{ estado: "pagada" }`

**Journey: Vencidas dashboard**
- `GET /api/entities/facturas/records?filters=estado = enviada&resolve_depth=1` then compute `fecha < today` client-side.

**Pitfalls:**
- `factura.numero` is `unique` — surface 400/`VALIDATION_ERROR` to the user instead of swallowing it.
- There is no date-arithmetic filter. "Vencidas" must be derived client-side from `fecha` and today's date.
- Pago is not auto-applied to factura. The two writes (create pago → update factura.estado) are independent — show progress and roll back if step 2 fails.

---

## Universal Patterns

### Naming Conventions
- Entity names: lowercase, plural, Spanish (pacientes, facturas, productos)
- Field keys: lowercase, snake_case (fecha_nacimiento, precio_unitario)
- Display names: Title Case Spanish (Fecha de Nacimiento, Precio Unitario)

### Status Fields
Always use `select` type with explicit options. Always include a default value (the initial state).

### Money Fields
Always `number` with `{ decimals: 2 }`. Never text.

### Required Fields
Mark as required: names, dates, amounts, foreign keys for core relations.
Leave optional: notes, descriptions, secondary contact info.

### Relations
Always specify `displayField` — usually "nombre" or "name".
Relations are always optional unless explicitly required.

### Frontend / REST Conventions (cross-cutting)

These apply to every Frontend Flow above — keep them in mind when generating UI:

- **Envelope:** every response is `{ success, data?, error? }`. Read list arrays from `data.items` (not `data.records`, not `data.data`). Records are flat — `record.fieldKey`, never `record.data.fieldKey`.
- **`resolve_depth`:** required whenever the UI needs related names instead of UUIDs. Pass `?resolve_depth=1` on list endpoints (max 2) and on single-record `GET /records/:id` (max 3). Without it, relation fields come back as UUID strings.
- **AND-only filters:** `?filters=` joins with `AND`. For OR conditions (e.g. "abierto OR en_preparacion"), fetch the AND-compatible subset and union client-side.
- **Computed fields:** anything driven by a Compute rule (`total`, `iva`, `subtotal`, `bajo_stock`, `horas_total`, `margen`, `edad`) must be rendered read-only in forms and refetched after writes — do not duplicate the formula in the UI.
- **Multi-entity transitions** (e.g. pay → close pedido → free mesa, create pago → mark factura pagada): the platform does not run them in a transaction. Sequence the writes, abort on first failure, and surface a partial-state warning rather than pretending the whole flow succeeded.
