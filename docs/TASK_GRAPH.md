# Task Graph

```mermaid
flowchart TD
  A[Prompt and repository audit] --> B[Critical path and safety model]
  B --> C[Persistence and API controls]
  C --> D[Operator UI controls]
  C --> E[Docker and diagnostics]
  C --> F[Adversarial API tests]
  D --> G[Browser acceptance]
  E --> H[Docker and fresh-clone checks]
  F --> I[Release gate]
  G --> I
  H --> I
  I --> J[Windows installer]
  J --> K[Final report and completion matrix]
  K --> L[Commit and push]
```

External blocked work is not on the executable graph: MicroMentor API authorization, app-level team identity/RBAC, Authenticode signing, and a managed update channel require systems or credentials outside this repository.
