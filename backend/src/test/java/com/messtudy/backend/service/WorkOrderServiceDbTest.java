package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.messtudy.backend.TestDb;

/** 테스트 DB(mes_test)에서 작업지시 등록 · 상태 전환 · 다음 지시 고르기를 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class WorkOrderServiceDbTest {

    @Autowired
    private WorkOrderService service;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        TestDb.reset(jdbc);
    }

    private static Map<String, Object> body(int plannedQty, Integer priority) {
        Map<String, Object> body = new HashMap<>(Map.of("itemCode", "MOTOR_A", "plannedQty", plannedQty));
        if (priority != null) {
            body.put("priority", priority);
        }
        return body;
    }

    private String create(int priority) {
        return (String) service.create(body(20, priority)).get("workOrderId");
    }

    private String statusOf(String workOrderId) {
        return (String) service.findById(workOrderId).get("status");
    }

    @Test
    void 등록하면_오늘_순번으로_번호를_붙이고_계획_상태다() {
        String today = LocalDate.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.BASIC_ISO_DATE);

        Map<String, Object> first = service.create(body(20, null));
        Map<String, Object> second = service.create(body(5, 7));

        assertThat(first).containsEntry("workOrderId", "WO-" + today + "-001")
                .containsEntry("status", "PLANNED")
                .containsEntry("priority", 5)
                .containsEntry("itemName", "BLDC 모터 표준형 A")
                .containsEntry("completedQty", 0);
        assertThat(second).containsEntry("workOrderId", "WO-" + today + "-002").containsEntry("priority", 7);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> performance = (List<Map<String, Object>>) first.get("performance");
        assertThat(performance).extracting(row -> row.get("equipmentId"))
                .containsExactly("CNC_01", "WINDER_01", "ASSEMBLY_01", "INSPECTION_01", "PACKER_01");
        assertThat(performance.get(0)).containsEntry("totalCount", 0).containsEntry("standardTactSec", 45);
    }

    @Test
    void 등록_값이_틀리면_400이고_저장하지_않는다() {
        assertInvalid(body(0, null), "plannedQty");
        assertInvalid(body(10_001, null), "plannedQty");
        assertInvalid(body(1, 10), "priority");
        Map<String, Object> unknownItem = body(1, null);
        unknownItem.put("itemCode", "NO_SUCH");
        assertInvalid(unknownItem, "itemCode");
        Map<String, Object> badDue = body(1, null);
        badDue.put("dueAt", "내일");
        assertInvalid(badDue, "dueAt");

        assertThat(service.findAll(List.of())).isEmpty();
    }

    @Test
    void 라인이_비어_있으면_하달하자마자_진행된다() {
        String id = create(5);

        Map<String, Object> released = service.release(id);

        assertThat(released).containsEntry("status", "IN_PROGRESS");
        assertThat(released.get("releasedAt")).isNotNull();
        assertThat(released.get("startedAt")).isNotNull();
    }

    @Test
    void 진행_중_지시가_있으면_하달만_되고_보류하면_우선순위_높은_순으로_다음_지시가_진행된다() {
        String running = create(5);
        String low = create(3);
        String high = create(8);
        service.release(running);
        service.release(low);
        service.release(high);
        assertThat(statusOf(low)).isEqualTo("RELEASED");
        assertThat(statusOf(high)).isEqualTo("RELEASED");

        service.hold(running);

        assertThat(statusOf(running)).isEqualTo("HELD");
        assertThat(statusOf(high)).isEqualTo("IN_PROGRESS");
        assertThat(statusOf(low)).isEqualTo("RELEASED");
    }

    @Test
    void 우선순위가_같으면_먼저_하달한_지시가_진행되고_보류_해제해도_처음_하달_순서를_지킨다() {
        String running = create(5);
        String first = create(5);
        String second = create(5);
        service.release(running);
        service.release(first);
        service.release(second);
        service.hold(first);
        service.resume(first); // 해제는 second보다 늦지만 처음 하달은 더 빠르다

        service.hold(running);

        assertThat(statusOf(first)).isEqualTo("IN_PROGRESS");
        assertThat(statusOf(second)).isEqualTo("RELEASED");
    }

    @Test
    void 보류를_해제해도_라인이_비어_있으면_바로_진행된다() {
        String id = create(5);
        service.release(id);
        service.hold(id);

        assertThat(service.resume(id)).containsEntry("status", "IN_PROGRESS");
    }

    @Test
    void 지금_상태에서_할_수_없는_전환은_409_없는_지시는_404다() {
        String id = create(5);
        service.release(id); // 진행

        assertThatThrownBy(() -> service.release(id)).isInstanceOf(StateConflictException.class)
                .hasMessageContaining("진행 상태인 작업지시는 하달할 수 없습니다");
        assertThatThrownBy(() -> service.resume(id)).isInstanceOf(StateConflictException.class);
        jdbc.update("UPDATE work_order SET status = 'COMPLETED' WHERE work_order_id = ?", id);
        assertThatThrownBy(() -> service.hold(id)).isInstanceOf(StateConflictException.class)
                .hasMessageContaining("완료 상태");
        assertThatThrownBy(() -> service.release("WO-NONE")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.findById("WO-NONE")).isInstanceOf(NotFoundException.class);
    }

    @Test
    void 목록은_상태로_거를_수_있고_모르는_상태면_400이다() {
        String running = create(5);
        create(5);
        service.release(running);

        assertThat(service.findAll(List.of("IN_PROGRESS"))).extracting(row -> row.get("workOrderId")).containsExactly(running);
        assertThat(service.findAll(List.of())).hasSize(2).first().satisfies(row -> assertThat(row).containsEntry("status", "IN_PROGRESS"));
        assertThatThrownBy(() -> service.findAll(List.of("DONE"))).isInstanceOf(InvalidPayloadException.class);
    }

    @Test
    void 진행_중_지시는_DB에서도_두_건이_될_수_없다() {
        String a = create(5);
        String b = create(5);
        service.release(a);

        assertThatThrownBy(() -> jdbc.update("UPDATE work_order SET status = 'IN_PROGRESS' WHERE work_order_id = ?", b))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void assertInvalid(Map<String, Object> body, String key) {
        assertThatThrownBy(() -> service.create(body)).isInstanceOf(InvalidPayloadException.class).hasMessageContaining(key);
    }
}
