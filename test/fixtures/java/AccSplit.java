package fixture.accessors;

// Exercises the accessor filter for `split` paired with `elementAt`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccSplit {

    private Probe25 probe;

    public void holds1() {
        probe.split();
        probe.elementAt();
    }

    public void holds2() {
        probe.split();
        probe.elementAt();
    }

    public void holds3() {
        probe.split();
        probe.elementAt();
    }

    public void holds4() {
        probe.split();
        probe.elementAt();
    }

    public void deviates() {
        probe.split();
    }
}
