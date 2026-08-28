extends Node2D

# Proves this is really running (not a static screenshot) — a rotating
# square and a live frame/time counter. See docs/ROADMAP.md Phase 2.

var elapsed := 0.0

func _process(delta: float) -> void:
	elapsed += delta
	$Square.rotation += delta
	$Label.text = "workspace-engine:// demo\nrunning %.1fs, frame %d" % [elapsed, Engine.get_process_frames()]
