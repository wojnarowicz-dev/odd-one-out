package fixture.accessors;

// Exercises the accessor filter for `stream` paired with `substring`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccStream {

    private Probe22 probe;

    public void holds1() {
        probe.stream();
        probe.substring();
    }

    public void holds2() {
        probe.stream();
        probe.substring();
    }

    public void holds3() {
        probe.stream();
        probe.substring();
    }

    public void holds4() {
        probe.stream();
        probe.substring();
    }

    public void deviates() {
        probe.stream();
    }
}
