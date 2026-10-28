package com.messtudy.backend.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 비가동 사유 목록 · 정지 조회 · 사유 입력. 정지를 만드는 쪽은 DowntimeMapper */
@Mapper
public interface DowntimeQueryMapper {

    /** 사유 목록(순서대로): reasonCode, category, reasonName */
    List<Map<String, Object>> findReasons();

    /**
     * 구간 [from, to)에 겹친 정지를 묶음(kind)마다 합한다. 겹친 초만 센다(정지 길이를 넘지 않게).
     * kind: REASON(사유 있음, 사유마다 한 행) · PENDING(사유 없고 minSec 이상) · MICRO(사유 없고 minSec 미만)
     *
     * @return kind, reasonCode, reasonName, category, displayOrder, seconds, count
     */
    List<Map<String, Object>> sumByKind(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("minSec") int minSec);

    /**
     * 구간에 겹친 정지 중 minSec 이상이거나 진행 중인 것. 진행 중 먼저, 그다음 최근 시작 순, 최대 limit건.
     * pendingOnly면 사유 없는 것만
     */
    List<Map<String, Object>> findAll(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("minSec") int minSec, @Param("pendingOnly") boolean pendingOnly, @Param("limit") int limit);

    /** 정지 한 건(findAll과 같은 키). 없으면 null */
    Map<String, Object> findById(@Param("id") long id);

    /** 작업자가 사유를 넣거나 고친다: 출처 MANUAL, 입력자, 입력 시각(지금) */
    int updateReason(@Param("id") long id, @Param("reasonCode") String reasonCode, @Param("enteredBy") String enteredBy);
}
