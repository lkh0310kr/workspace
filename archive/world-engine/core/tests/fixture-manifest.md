# World Engine fixture 목록 (Phase 25 CI smoke)

저장소 root에서 실행:

```bash
cd world-engine/core && cargo test
```

## 계약 테스트

| 테스트 파일 | Phase |
|-----------|-------|
| simulation_contract | 13 |
| input_contract | 14 |
| collision_contract | 15 |
| entity_contract | 17 |
| prefab_contract | 20 |
| save_contract | 21 |
| physics_layers_contract | 22 |
| game_contract | 23–24 |
| benchmark_smoke | 29 |

## Fixture 프로젝트

모두 `apps/workspace/test-fixtures/world-engine-*` 아래에 있습니다.
