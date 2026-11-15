# SRDF end effector

`<end_effector>` 항목을 만들거나 편집할 때 이 문서를 참고하세요.

## 개념

End effector는 tool, gripper, sensor head 또는 다른 말단 group을 의미론적으로 지정한 것입니다. 일반적으로 fixed joint 또는 attachment link를 통해 parent planning group에 연결됩니다.

Typical shape:

```xml
<group name="gripper">
  <joint name="finger_joint"/>
</group>

<end_effector
  name="gripper_eef"
  parent_link="tool0"
  group="gripper"
  parent_group="manipulator"/>
```

## 필수 ledger 항목

다음 항목을 기록하세요:

- end-effector name;
- end-effector group;
- parent planning group;
- parent link where the end effector attaches;
- target/TCP link used for IK and planning;
- whether the end-effector group overlaps the parent group;
- whether the parent link is adjacent to the end-effector group in the URDF graph.

## 확인 사항

작성 전에 확인하세요:

- The end-effector group exists.
- The parent group exists when specified.
- The parent link exists in the URDF.
- The end-effector group and parent group do not share links.
- The parent link is in the parent group or adjacent to the end-effector group.
- The target/TCP link is explicit when it differs from the inferred group tip.

현재 runtime은 이 확인 사항 중 일부를 강제하지만 target/TCP 선택은 여전히 의미론적 결정입니다. tool center point를 기준으로 계획할 때는 추론에 의존하지 마세요.

## 전달

SRDF를 다른 tool이나 검토자에게 전달할 때 추론한 group tip과 다른 target/TCP link를 의도한다면 명시하세요. target 선택은 소비자가 추론할 수 없는 의미론적 결정입니다.
