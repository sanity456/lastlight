import itertools
import json

import pytest


CONTRACT = "contracts/lastlight.py"
SESSION = "a" * 32
ACTIONS = ["b" * 32, "c" * 32, "d" * 32]
PLAN = (
    "I isolate the intake, clear the blockage with the toolkit, turn the handwheel, "
    "and check the pressure gauge before reopening normal flow."
)
FLAGS = {
    "SUCCESS": {"c1": True, "c2": True, "c3": True, "invalid": False},
    "PARTIAL": {"c1": True, "c2": True, "c3": False, "invalid": False},
    "FAIL": {"c1": True, "c2": False, "c3": False, "invalid": False},
}


def mock_band(vm, band):
    vm.clear_mocks()
    vm.mock_llm(r".*independent evaluator.*", json.dumps(FLAGS[band]))


def test_solo_full_run_and_idempotent_retry(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    created = contract.create_session(SESSION, "SOLO", "")
    assert created["status"] == "ACTIVE"
    assert created["oxygen"] == 60
    for index in range(3):
        mock_band(direct_vm, "SUCCESS")
        record = contract.submit_plan(SESSION, index, ACTIONS[index], PLAN)
        assert record["band"] == "SUCCESS"
        before_retry = contract.get_session(SESSION)
        assert contract.submit_plan(SESSION, index, ACTIONS[index], PLAN) == record
        assert contract.get_session(SESSION) == before_retry
    final = contract.get_session(SESSION)
    assert (final["status"], final["ending"], final["final_score"]) == ("COMPLETED", "RESCUED", 290)
    assert (final["oxygen"], final["power"], final["hull"]) == (48, 39, 80)
    assert contract.get_round(SESSION, 2)["round_index"] == 2
    assert contract.list_sessions("0x" + direct_alice.hex(), 0, 20)["total"] == 1


def test_duo_invitation_and_turn_order(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_session(SESSION, "DUO", "0x" + direct_bob.hex())
    assert contract.get_session(SESSION)["status"] == "WAITING"
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the invited guest"):
        contract.join_session(SESSION)
    direct_vm.sender = direct_bob
    contract.join_session(SESSION)
    assert contract.list_sessions("0x" + direct_bob.hex(), 0, 20)["total"] == 1
    mock_band(direct_vm, "SUCCESS")
    with direct_vm.expect_revert("Only the current pilot"):
        contract.submit_plan(SESSION, 0, ACTIONS[0], PLAN)
    direct_vm.sender = direct_alice
    contract.submit_plan(SESSION, 0, ACTIONS[0], PLAN)
    direct_vm.sender = direct_bob
    contract.submit_plan(SESSION, 1, ACTIONS[1], PLAN)
    direct_vm.sender = direct_alice
    contract.submit_plan(SESSION, 2, ACTIONS[2], PLAN)
    assert contract.get_session(SESSION)["final_score"] == 290


def test_rejects_conflicting_retry_and_stale_action(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_session(SESSION, "SOLO", "")
    mock_band(direct_vm, "PARTIAL")
    contract.submit_plan(SESSION, 0, ACTIONS[0], PLAN)
    with direct_vm.expect_revert("different action"):
        contract.submit_plan(SESSION, 0, ACTIONS[1], PLAN)
    with direct_vm.expect_revert("already used"):
        contract.submit_plan(SESSION, 1, ACTIONS[0], PLAN)
    with direct_vm.expect_revert("not active at this round"):
        contract.submit_plan(SESSION, 2, ACTIONS[2], PLAN)
    assert contract.get_session(SESSION)["next_round_index"] == 1


def test_malformed_judgment_does_not_consume_turn(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_session(SESSION, "SOLO", "")
    direct_vm.mock_llm(r".*independent evaluator.*", '{"c1":"true","c2":true,"c3":true,"invalid":false}')
    with direct_vm.expect_revert("booleans"):
        contract.submit_plan(SESSION, 0, ACTIONS[0], PLAN)
    state = contract.get_session(SESSION)
    assert state["next_round_index"] == 0
    assert (state["oxygen"], state["power"], state["hull"]) == (60, 60, 80)


def test_cancel_and_abandon_roles(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_session(SESSION, "DUO", "0x" + direct_bob.hex())
    contract.cancel_session(SESSION)
    assert contract.get_session(SESSION)["status"] == "CANCELLED"
    with direct_vm.expect_revert("not waiting"):
        contract.join_session(SESSION)
    other = "e" * 32
    contract.create_session(other, "DUO", "0x" + direct_bob.hex())
    direct_vm.sender = direct_bob
    contract.join_session(other)
    contract.abandon_session(other)
    assert contract.get_session(other)["final_score"] == 0
    with direct_vm.expect_revert("not active"):
        contract.submit_plan(other, 0, ACTIONS[0], PLAN)


@pytest.mark.parametrize("bands", list(itertools.product(FLAGS, repeat=3)))
def test_every_outcome_path_has_legal_next_turn(direct_vm, direct_deploy, direct_alice, bands):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_session(SESSION, "SOLO", "")
    for index, band in enumerate(bands):
        state = contract.get_session(SESSION)
        if state["status"] != "ACTIVE":
            break
        costs = [8, 12, 10]
        assert state["power"] >= costs[index]
        mock_band(direct_vm, band)
        contract.submit_plan(SESSION, index, ACTIONS[index], PLAN)
        changed = contract.get_session(SESSION)
        assert all(0 <= changed[key] <= 100 for key in ("oxygen", "power", "hull"))
    final = contract.get_session(SESSION)
    assert final["status"] in ("COMPLETED", "FAILED")
    if bands == ("PARTIAL",) * 3:
        assert final["final_score"] == 134
    if bands == ("FAIL",) * 3:
        assert final["final_score"] == 0
