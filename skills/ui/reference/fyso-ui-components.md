# @fyso/ui Component Reference

Quick reference for the metadata-driven React components used in generated UIs.

## Setup

```bash
bun add @fyso/ui react react-dom
```

```tsx
import { FysoProvider, DataGrid, DynamicForm, RecordDetail } from '@fyso/ui'
import '@fyso/ui/styles.css'
```

## FysoProvider

Wraps your app. All components must be inside it.

```tsx
<FysoProvider
  endpoint="https://api.fyso.dev/api"    // Fyso API URL
  token={userToken}                       // Bearer token (null = not authenticated)
  translations={{                         // Optional i18n
    table: { noResults: 'Sin resultados', previous: 'Anterior', next: 'Siguiente' },
    form: { create: 'Crear', save: 'Guardar', cancel: 'Cancelar', required: 'Requerido' },
  }}
  onAuthError={(err) => {                 // Optional 401/403 handler
    logout()
    navigate('/login')
  }}
>
  {children}
</FysoProvider>
```

## Hooks

### useFysoEntity(entityName)

Fetches and caches entity schema.

```tsx
const { entity, loading, error } = useFysoEntity('pacientes')
// entity: EntityDefinition | null
// entity.fields: FieldDefinition[]
// entity.name, entity.displayName, entity.description
```

### useFysoClient()

Returns the API client for direct queries.

```tsx
const client = useFysoClient()

// List records
const { data } = await client.records.list('pacientes', {
  page: '1', limit: '20', sort: 'name', order: 'asc'
})
// data.items: Record[], data.total, data.page, data.totalPages
// Each Record is flat: { id, fieldKey, createdAt, ... } — NOT nested under .data

// Get one record
const record = await client.records.get('pacientes', recordId)

// Create record
const created = await client.records.create('pacientes', {
  nombre: 'María', apellido: 'García', dni: '30123456'
})

// Update record
await client.records.update('pacientes', recordId, { email: 'new@email.com' })

// Delete record
await client.records.delete('pacientes', recordId)

// Get entities list
const entities = await client.metadata.getEntities()

// Get entity schema
const schema = await client.metadata.getEntitySchema('pacientes')
```

### useFyso()

Full context (client + translations + cache).

```tsx
const { client, translations, entityCache } = useFyso()
```

## DataGrid

Auto-columns from entity metadata. Desktop table + mobile cards.

```tsx
<DataGrid
  entity={entity}                    // EntityDefinition from useFysoEntity
  data={records}                     // EntityRecord[]
  pagination={{                      // PaginationInfo
    total: 127,
    page: 1,
    limit: 20,
    totalPages: 7,
  }}
  onPageChange={(page) => setPage(page)}
  onSort={(field) => toggleSort(field)}
  onRowClick={(record) => navigate(`/app/pacientes/${record.id}`)}
  onDelete={(record) => confirmDelete(record)}  // Optional: show delete action
  currentSort="nombre"                           // Optional: current sort field
  currentOrder="asc"                             // Optional: sort direction
  searchTerm="García"                            // Optional: highlight matches
/>
```

**Features:**
- Auto-generates columns from entity fields
- Hides system fields (id, entityId, createdAt, updatedAt)
- Relation fields show display value (not UUID)
- Boolean fields show checkmark
- Date fields formatted
- Number fields formatted with decimals
- Mobile: switches to card view automatically
- Pagination controls

## DynamicForm

Auto-generated form from entity schema.

```tsx
<DynamicForm
  entity={entity}                    // EntityDefinition
  mode="create"                      // 'create' | 'edit'
  onSubmit={async (data) => {        // Submit handler
    await client.records.create('pacientes', data)
    navigate('/app/pacientes')
  }}
  onCancel={() => navigate(-1)}      // Cancel handler
  initialData={existingRecord}       // Pre-fill for edit mode (optional)
/>
```

**Features:**
- Generates correct input type per field type
- Text → input[type=text]
- Number → input[type=number] with step
- Email → input[type=email]
- Date → date picker with calendar
- Boolean → checkbox
- Select → dropdown with options
- Relation → dropdown with search (fetches related records)
- Textarea → multi-line input
- Required fields marked with *
- Client-side validation
- Relation fields with inline create option

## RecordDetail

Master-detail view with child entity records.

```tsx
import { getChildRelations } from '@fyso/ui'

// Get child relations for this entity
const relations = getChildRelations(entity, allEntities)
// Returns: [{ entity: 'sesiones', field: 'paciente_id', displayName: 'Sesiones' }, ...]

<RecordDetail
  parentEntity={entity}              // Parent EntityDefinition
  parentId={recordId}                // Parent record ID (optional for new)
  relations={relations}              // ChildRelationInfo[]
/>
```

**Features:**
- Shows child records in tabs or stacked tables
- Each child table is a mini DataGrid
- Add button to create new child record (pre-fills relation field)
- Navigate to child record detail

## UI Primitives

For custom compositions beyond the metadata-driven components:

```tsx
import { Button, Input, Label, Calendar, Table, cn } from '@fyso/ui'

// Button variants
<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive">Delete</Button>
<Button variant="ghost">Ghost</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>

// Input
<Input type="text" placeholder="Search..." />

// Table (manual)
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>María García</TableCell>
      <TableCell>maria@test.com</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## Typical Page Implementation

### Entity List Page

```tsx
import { useState, useEffect } from 'react'
import { DataGrid, useFysoEntity, useFysoClient, Button } from '@fyso/ui'

export function PacientesList() {
  const { entity, loading: schemaLoading } = useFysoEntity('pacientes')
  const client = useFysoClient()
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 })
  const [sort, setSort] = useState('nombre')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (!entity) return
    client.records.list('pacientes', {
      page: String(pagination.page),
      limit: String(pagination.limit),
      sort,
      order,
    }).then(({ data }) => {
      setRecords(data.items)  // v1.26.0+: data.items (not data.data)
      setPagination(data)
    })
  }, [entity, pagination.page, sort, order])

  if (schemaLoading || !entity) return <div>Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{entity.displayName}</h1>
        <Button onClick={() => navigate('/app/pacientes/new')}>+ Nuevo</Button>
      </div>
      <DataGrid
        entity={entity}
        data={records}
        pagination={pagination}
        onPageChange={(page) => setPagination(p => ({ ...p, page }))}
        onSort={(field) => {
          if (field === sort) setOrder(o => o === 'asc' ? 'desc' : 'asc')
          else { setSort(field); setOrder('asc') }
        }}
        onRowClick={(record) => navigate(`/app/pacientes/${record.id}`)}
        currentSort={sort}
        currentOrder={order}
      />
    </div>
  )
}
```

### Entity Form Page

```tsx
import { DynamicForm, useFysoEntity, useFysoClient } from '@fyso/ui'

export function PacientesForm({ mode = 'create', recordId }) {
  const { entity } = useFysoEntity('pacientes')
  const client = useFysoClient()
  const [initialData, setInitialData] = useState(null)

  useEffect(() => {
    if (mode === 'edit' && recordId) {
      client.records.get('pacientes', recordId).then(r => setInitialData(r.data))
    }
  }, [mode, recordId])

  if (!entity) return <div>Loading...</div>

  return (
    <DynamicForm
      entity={entity}
      mode={mode}
      initialData={initialData}
      onSubmit={async (data) => {
        if (mode === 'create') {
          await client.records.create('pacientes', data)
        } else {
          await client.records.update('pacientes', recordId, data)
        }
        navigate('/app/pacientes')
      }}
      onCancel={() => navigate(-1)}
    />
  )
}
```

## Utilities

```tsx
import {
  getChildRelations,   // Get child entity relations for RecordDetail
  isDetailEntity,      // Check if entity is a "detail" (child) entity
  getCardFields,       // Get fields to show in mobile card view
  parseISODate,        // Parse ISO date string to Date
  formatToISO,         // Format Date to ISO string
  formatToDisplay,     // Format Date to display string
  cn,                  // Tailwind class merge (clsx + twMerge)
} from '@fyso/ui'
```
